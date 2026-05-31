import { Hono } from "hono";
import type { Bindings } from "../types";
import { transcribeAudio } from "../services/transcription";
import { resolveAI } from "../services/ai-resolver";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const notesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/notes — sorted by visit_date desc, optional ?document_id= filter
notesRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const documentId = c.req.query("document_id");

  let sql = `SELECT id, patient_id, document_id, visit_date, doctor_name, facility,
             diagnosis, summary, treatment_plan,
             audio_r2_key, audio_transcript, audio_duration_sec,
             created_by, updated_by, created_at, updated_at
             FROM clinical_notes
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [pid];

  if (documentId) {
    sql += " AND document_id = ?";
    params.push(documentId);
  }

  sql += " ORDER BY visit_date DESC";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ notes: result.results });
});

// POST /api/patients/:pid/notes — accepts multipart (with audio) or JSON
notesRoutes.post("/", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  let visitDate: string | null = null;
  let summary: string | null = null;
  let doctorName: string | null = null;
  let facility: string | null = null;
  let diagnosis: string | null = null;
  let treatmentPlan: string | null = null;
  let documentId: string | null = null;
  let audioFile: File | null = null;
  let audioDurationSec: number | null = null;
  let transcribeFlag = false;

  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData();
    visitDate = (formData.get("visit_date") as string | null) || null;
    summary = (formData.get("summary") as string | null) || null;
    doctorName = (formData.get("doctor_name") as string | null) || null;
    facility = (formData.get("facility") as string | null) || null;
    diagnosis = (formData.get("diagnosis") as string | null) || null;
    treatmentPlan = (formData.get("treatment_plan") as string | null) || null;
    documentId = (formData.get("document_id") as string | null) || null;
    audioFile = (formData.get("audio") as File | null) || null;
    const durStr = formData.get("audio_duration_sec") as string | null;
    audioDurationSec = durStr ? Number(durStr) : null;
    transcribeFlag = formData.get("transcribe") === "true";
  } else {
    const body = await c.req.json<{
      visit_date: string;
      summary: string;
      doctor_name?: string;
      facility?: string;
      diagnosis?: string;
      treatment_plan?: string;
      document_id?: string;
    }>();
    visitDate = body.visit_date ?? null;
    summary = body.summary ?? null;
    doctorName = body.doctor_name ?? null;
    facility = body.facility ?? null;
    diagnosis = body.diagnosis ?? null;
    treatmentPlan = body.treatment_plan ?? null;
    documentId = body.document_id ?? null;
  }

  if (!visitDate || !summary) {
    return c.json({ error: "visit_date and summary are required" }, 400);
  }

  const id = crypto.randomUUID();
  let audioR2Key: string | null = null;
  let audioTranscript: string | null = null;

  if (audioFile) {
    if (audioFile.size > 25 * 1024 * 1024) {
      return c.json({ error: "Audio file exceeds 25 MB limit" }, 413);
    }
    audioR2Key = `patients/${pid}/notes/${id}/recording.webm`;
    const audioBuffer = await audioFile.arrayBuffer();
    await c.env.BUCKET.put(audioR2Key, audioBuffer, {
      httpMetadata: { contentType: "audio/webm" },
    });

    if (transcribeFlag) {
      try {
        const resolved = await resolveAI("voice_trans", c.env);
        if (resolved) {
          audioTranscript = await transcribeAudio(resolved.apiKey, audioBuffer);
        }
      } catch (err) {
        console.error("Auto-transcription failed:", err);
      }
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO clinical_notes
      (id, patient_id, document_id, visit_date, doctor_name, facility, diagnosis,
       summary, treatment_plan, audio_r2_key, audio_transcript, audio_duration_sec,
       created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, pid, documentId, visitDate,
    doctorName, facility, diagnosis,
    summary, treatmentPlan,
    audioR2Key, audioTranscript, audioDurationSec,
    user.sub, user.sub
  ).run();

  const note = await c.env.DB.prepare(
    "SELECT * FROM clinical_notes WHERE id = ?"
  ).bind(id).first();

  return c.json({ note }, 201);
});

// GET /api/patients/:pid/notes/:nid/audio — stream audio from R2
notesRoutes.get("/:nid/audio", async (c) => {
  const pid = c.get("patientId");
  const nid = c.req.param("nid");

  const note = await c.env.DB.prepare(
    "SELECT audio_r2_key FROM clinical_notes WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(nid, pid).first<{ audio_r2_key: string | null }>();

  if (!note?.audio_r2_key) return c.json({ error: "Not found" }, 404);

  const obj = await c.env.BUCKET.get(note.audio_r2_key);
  if (!obj) return c.json({ error: "Not found" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": "audio/webm",
      "Content-Disposition": "inline",
    },
  });
});

// POST /api/patients/:pid/notes/:nid/transcribe — on-demand transcription
notesRoutes.post("/:nid/transcribe", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const nid = c.req.param("nid");

  if (patientRole !== "admin") return c.json({ error: "Forbidden" }, 403);

  const note = await c.env.DB.prepare(
    "SELECT id, audio_r2_key, audio_transcript FROM clinical_notes WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(nid, pid).first<{ id: string; audio_r2_key: string | null; audio_transcript: string | null }>();

  if (!note) return c.json({ error: "Note not found or no audio" }, 404);
  if (note.audio_transcript !== null) return c.json({ error: "Transcript already exists" }, 409);

  const resolved = await resolveAI("voice_trans", c.env);
  if (!resolved) return c.json({ error: "Voice transcription not configured" }, 503);

  if (!note.audio_r2_key) return c.json({ error: "Note not found or no audio" }, 404);
  const obj = await c.env.BUCKET.get(note.audio_r2_key);
  if (!obj) return c.json({ error: "Audio not found in storage" }, 404);

  const audioBuffer = await obj.arrayBuffer();

  try {
    const transcript = await transcribeAudio(resolved.apiKey, audioBuffer);
    await c.env.DB.prepare(
      "UPDATE clinical_notes SET audio_transcript = ?, updated_at = ? WHERE id = ?"
    ).bind(transcript, new Date().toISOString(), nid).run();
  } catch (err) {
    console.error("On-demand transcription failed:", err);
    return c.json({ error: "Transcription failed" }, 502);
  }

  const updated = await c.env.DB.prepare(
    "SELECT * FROM clinical_notes WHERE id = ?"
  ).bind(nid).first();

  return c.json({ note: updated });
});

// PUT /api/patients/:pid/notes/:id — update (admin)
notesRoutes.put("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM clinical_notes WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Note not found" }, 404);

  const body = await c.req.json<{
    visit_date?: string;
    summary?: string;
    doctor_name?: string;
    facility?: string;
    diagnosis?: string;
    treatment_plan?: string;
    document_id?: string | null;
  }>();

  const now = new Date().toISOString();

  // Build dynamic UPDATE — only set fields present in the request body
  const setClauses: string[] = ["updated_by = ?", "updated_at = ?"];
  const bindValues: unknown[] = [user.sub, now];

  const fieldMap: [string, unknown][] = [
    ["visit_date", body.visit_date],
    ["summary", body.summary],
    ["doctor_name", body.doctor_name],
    ["facility", body.facility],
    ["diagnosis", body.diagnosis],
    ["treatment_plan", body.treatment_plan],
    ["document_id", body.document_id],
  ];

  for (const [field, value] of fieldMap) {
    if (field in body) {
      setClauses.unshift(`${field} = ?`);
      bindValues.unshift(value ?? null);
    }
  }

  bindValues.push(id);

  await c.env.DB.prepare(
    `UPDATE clinical_notes SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...bindValues).run();

  const note = await c.env.DB.prepare(
    "SELECT * FROM clinical_notes WHERE id = ?"
  ).bind(id).first();

  return c.json({ note });
});

// DELETE /api/patients/:pid/notes/:id — soft delete (admin)
notesRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM clinical_notes WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Note not found" }, 404);

  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE clinical_notes SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, user.sub, now, id).run();

  return c.json({ ok: true });
});
