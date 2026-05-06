import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

async function seedDocument(db: D1Database, id = "doc-1", patientId = "patient-1") {
  await db
    .prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES (?, ?, 'consultation', 'Consultation', '2024-01-15', ?, 'application/pdf', 12345, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    )
    .bind(id, patientId, `patients/${patientId}/documents/${id}/consult.pdf`)
    .run();
}

async function seedNote(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    patient_id: string;
    visit_date: string;
    summary: string;
    doctor_name: string;
    diagnosis: string;
    is_deleted: number;
    document_id: string | null;
  }>
) {
  const id = overrides?.id ?? "note-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const visit_date = overrides?.visit_date ?? "2024-01-15";
  const summary = overrides?.summary ?? "Routine checkup";
  const doctor_name = overrides?.doctor_name ?? "Dr. Smith";
  const diagnosis = overrides?.diagnosis ?? "Hypertension";
  const is_deleted = overrides?.is_deleted ?? 0;
  const document_id = overrides?.document_id ?? null;

  await db
    .prepare(
      `INSERT INTO clinical_notes (id, patient_id, document_id, visit_date, summary, doctor_name, diagnosis, is_deleted, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    )
    .bind(id, patient_id, document_id, visit_date, summary, doctor_name, diagnosis, is_deleted)
    .run();
  return id;
}

describe("GET /api/patients/:pid/notes", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("returns notes sorted by visit_date desc, excludes deleted", async () => {
    await seedNote(env.DB, { id: "note-1", visit_date: "2024-01-10" });
    await seedNote(env.DB, { id: "note-2", visit_date: "2024-06-01", summary: "Follow-up" });
    await seedNote(env.DB, { id: "note-deleted", visit_date: "2024-03-01", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.notes.length).toBe(2);
    expect(body.notes[0].id).toBe("note-2"); // Most recent first
    expect(body.notes[1].id).toBe("note-1");
  });

  it("viewer can read notes", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/notes",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/patients/patient-1/notes", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("filters by document_id when provided", async () => {
    await seedDocument(env.DB, "doc-1");
    await seedDocument(env.DB, "doc-2");
    await seedNote(env.DB, { id: "note-1", document_id: "doc-1" });
    await seedNote(env.DB, { id: "note-2", document_id: "doc-2" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes?document_id=doc-1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.notes.length).toBe(1);
    expect(body.notes[0].id).toBe("note-1");
  });
});

describe("POST /api/patients/:pid/notes", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can create a note with audit fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          visit_date: "2024-06-01",
          summary: "Patient doing well",
          doctor_name: "Dr. Kumar",
          diagnosis: "Controlled hypertension",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.note.summary).toBe("Patient doing well");
    expect(body.note.created_by).toBe("admin-1");
    expect(body.note.updated_by).toBe("admin-1");
  });

  it("returns 400 for missing required fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ visit_date: "2024-06-01" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("viewer cannot create note", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/notes",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ visit_date: "2024-06-01", summary: "Note" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/patients/:pid/notes/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedNote(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can update note and sets updated_by", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosis: "Controlled hypertension", treatment_plan: "Continue medication" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.note.diagnosis).toBe("Controlled hypertension");
    expect(body.note.updated_by).toBe("admin-1");
  });

  it("returns 404 for non-existent note", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/nope",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "Updated" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot update note", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ summary: "Updated" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/patients/:pid/notes/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedNote(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can soft-delete a note", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare("SELECT is_deleted FROM clinical_notes WHERE id = ?")
      .bind("note-1").first<any>();
    expect(row?.is_deleted).toBe(1);
  });

  it("viewer cannot delete note", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent note", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/nope",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

afterEach(() => vi.restoreAllMocks());

// ── R2 bucket stub (avoids vitest-pool-workers .sqlite-shm bug on first R2 write) ──

interface BucketStubObject {
  body: ReadableStream<Uint8Array>;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

function makeBucketStub() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async put(key: string, value: ArrayBuffer | Uint8Array, _opts?: unknown): Promise<void> {
      store.set(key, value instanceof Uint8Array ? value : new Uint8Array(value));
    },
    async get(key: string): Promise<BucketStubObject | null> {
      const bytes = store.get(key);
      if (!bytes) return null;
      const b = bytes;
      return {
        body: new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(b); controller.close(); },
        }),
        size: b.byteLength,
        arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      };
    },
  };
}

// ── Audio: POST with audio file ──────────────────────────────────────────────

describe("POST /api/patients/:pid/notes — multipart with audio", () => {
  let bucketStub: ReturnType<typeof makeBucketStub>;

  beforeEach(async () => {
    bucketStub = makeBucketStub();
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("stores audio in R2 and sets audio_r2_key on note", async () => {
    const token = await adminToken();
    const audioBlob = new Blob([new Uint8Array(100)], { type: "audio/webm" });
    const fd = new FormData();
    fd.append("visit_date", "2024-06-01");
    fd.append("summary", "Voice note test");
    fd.append("audio", audioBlob, "recording.webm");
    fd.append("audio_duration_sec", "5");
    fd.append("transcribe", "false");

    const res = await app.request(
      "/api/patients/patient-1/notes",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.note.audio_r2_key).toMatch(/^patients\/patient-1\/notes\/.+\/recording\.webm$/);
    expect(body.note.audio_duration_sec).toBe(5);
    expect(body.note.audio_transcript).toBeNull();
  });

  it("transcribes when transcribe=true and DEEPGRAM_API_KEY set", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          metadata: {},
          results: { channels: [{ alternatives: [{ transcript: "Patient has fever.", confidence: 0.99, words: [] }] }] }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const token = await adminToken();
    const audioBlob = new Blob([new Uint8Array(100)], { type: "audio/webm" });
    const fd = new FormData();
    fd.append("visit_date", "2024-06-01");
    fd.append("summary", "Auto-transcribe test");
    fd.append("audio", audioBlob, "recording.webm");
    fd.append("audio_duration_sec", "3");
    fd.append("transcribe", "true");

    const res = await app.request(
      "/api/patients/patient-1/notes",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket, DEEPGRAM_API_KEY: "dg-test-key" }
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.note.audio_transcript).toBe("Patient has fever.");
  });

  it("stores audio but skips transcription when no DEEPGRAM_API_KEY", async () => {
    const token = await adminToken();
    const audioBlob = new Blob([new Uint8Array(100)], { type: "audio/webm" });
    const fd = new FormData();
    fd.append("visit_date", "2024-06-01");
    fd.append("summary", "No key test");
    fd.append("audio", audioBlob, "recording.webm");
    fd.append("audio_duration_sec", "2");
    fd.append("transcribe", "true");

    const res = await app.request(
      "/api/patients/patient-1/notes",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.note.audio_r2_key).not.toBeNull();
    expect(body.note.audio_transcript).toBeNull();
  });

  it("rejects audio > 25 MB with 413", async () => {
    const token = await adminToken();
    const largeBlob = new Blob([new Uint8Array(26 * 1024 * 1024)], { type: "audio/webm" });
    const fd = new FormData();
    fd.append("visit_date", "2024-06-01");
    fd.append("summary", "Large file test");
    fd.append("audio", largeBlob, "recording.webm");
    fd.append("audio_duration_sec", "999");

    const res = await app.request(
      "/api/patients/patient-1/notes",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(413);
  });
});

// ── Audio: GET audio stream ───────────────────────────────────────────────────

describe("GET /api/patients/:pid/notes/:nid/audio", () => {
  let bucketStub: ReturnType<typeof makeBucketStub>;

  beforeEach(async () => {
    bucketStub = makeBucketStub();
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns audio bytes from R2", async () => {
    const noteId = "note-audio-1";
    const r2Key = `patients/patient-1/notes/${noteId}/recording.webm`;
    const audioBytes = new Uint8Array([1, 2, 3, 4, 5]);
    await bucketStub.put(r2Key, audioBytes);
    await env.DB.prepare(
      `INSERT INTO clinical_notes (id, patient_id, visit_date, summary, audio_r2_key, created_by, updated_by)
       VALUES (?, 'patient-1', '2024-01-01', 'Test', ?, 'admin-1', 'admin-1')`
    ).bind(noteId, r2Key).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/notes/${noteId}/audio`,
      { headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
  });

  it("returns 404 when note has no audio_r2_key", async () => {
    await seedNote(env.DB, { id: "note-no-audio" });
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-no-audio/audio",
      { headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(404);
  });
});

// ── Audio: POST transcribe ────────────────────────────────────────────────────

describe("POST /api/patients/:pid/notes/:nid/transcribe", () => {
  let bucketStub: ReturnType<typeof makeBucketStub>;

  beforeEach(async () => {
    bucketStub = makeBucketStub();
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("transcribes audio and patches note", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          metadata: {},
          results: { channels: [{ alternatives: [{ transcript: "Follow-up in 2 weeks.", confidence: 0.99, words: [] }] }] }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const noteId = "note-tx-1";
    const r2Key = `patients/patient-1/notes/${noteId}/recording.webm`;
    await bucketStub.put(r2Key, new Uint8Array([1, 2, 3]));
    await env.DB.prepare(
      `INSERT INTO clinical_notes (id, patient_id, visit_date, summary, audio_r2_key, created_by, updated_by)
       VALUES (?, 'patient-1', '2024-01-01', 'Test note', ?, 'admin-1', 'admin-1')`
    ).bind(noteId, r2Key).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/notes/${noteId}/transcribe`,
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket, DEEPGRAM_API_KEY: "dg-test-key" }
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.note.audio_transcript).toBe("Follow-up in 2 weeks.");
  });

  it("returns 409 if transcript already exists", async () => {
    const noteId = "note-tx-dup";
    const r2Key = `patients/patient-1/notes/${noteId}/recording.webm`;
    await bucketStub.put(r2Key, new Uint8Array([1, 2, 3]));
    await env.DB.prepare(
      `INSERT INTO clinical_notes (id, patient_id, visit_date, summary, audio_r2_key, audio_transcript, created_by, updated_by)
       VALUES (?, 'patient-1', '2024-01-01', 'Test', ?, 'Existing transcript', 'admin-1', 'admin-1')`
    ).bind(noteId, r2Key).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/notes/${noteId}/transcribe`,
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket, DEEPGRAM_API_KEY: "dg-test-key" }
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 if note has no audio", async () => {
    await seedNote(env.DB, { id: "note-no-audio" });
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-no-audio/transcribe",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket, DEEPGRAM_API_KEY: "dg-test-key" }
    );
    expect(res.status).toBe(404);
  });

  it("returns 503 if DEEPGRAM_API_KEY not configured", async () => {
    await seedNote(env.DB, { id: "note-no-key" });
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-no-key/transcribe",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket }
    );
    expect(res.status).toBe(503);
  });

  it("viewer cannot transcribe", async () => {
    await seedNote(env.DB, { id: "note-viewer" });
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/notes/note-viewer/transcribe",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      { ...TEST_ENV, BUCKET: bucketStub as unknown as R2Bucket, DEEPGRAM_API_KEY: "dg-test-key" }
    );
    expect(res.status).toBe(403);
  });
});
