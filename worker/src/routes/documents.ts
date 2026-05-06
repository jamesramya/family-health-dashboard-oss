import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const documentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/documents — list documents with optional type/date filters
documentRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const typeFilter = c.req.query("type");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");

  let sql = `SELECT id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
             source_lab, processing_status, workflow_instance_id, uploaded_by, created_at, updated_at,
             medication_review_status
             FROM documents
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [pid];

  if (typeFilter) {
    sql += " AND type = ?";
    params.push(typeFilter);
  }
  if (dateFrom) {
    sql += " AND document_date >= ?";
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += " AND document_date <= ?";
    params.push(dateTo);
  }

  sql += " ORDER BY document_date DESC, created_at DESC";

  const stmt = c.env.DB.prepare(sql);
  const result = await stmt.bind(...params).all();

  return c.json({ documents: result.results });
});

// GET /api/patients/:pid/documents/:id — metadata
documentRoutes.get("/:id", async (c) => {
  const pid = c.get("patientId");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    `SELECT id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
     source_lab, processing_status, workflow_instance_id, uploaded_by, created_at, updated_at,
     llm_raw_response, medication_review_status, medication_review_decisions
     FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0`
  ).bind(id, pid).first<Record<string, unknown>>();

  if (!row) return c.json({ error: "Document not found" }, 404);

  const document = {
    ...row,
    llm_raw_response: row.llm_raw_response ? JSON.parse(row.llm_raw_response as string) : null,
    medication_review_decisions: row.medication_review_decisions
      ? JSON.parse(row.medication_review_decisions as string)
      : [],
  };

  return c.json({ document });
});

// POST /api/patients/:pid/documents/upload — multipart upload → R2 + trigger Workflow
documentRoutes.post("/upload", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required to upload" }, 403);
  }

  const body = await c.req.parseBody();
  const file = body["file"] as File | undefined;
  const type = body["type"] as string | undefined;
  const title = body["title"] as string | undefined;
  const documentDate = body["document_date"] as string | undefined;
  const sourceLab = body["source_lab"] as string | undefined;

  if (!file || !type || !title || !documentDate) {
    return c.json({ error: "file, type, title, and document_date are required" }, 400);
  }

  const VALID_DOC_TYPES = ["blood_report", "scan", "ecg", "prescription", "consultation", "other"];
  if (!VALID_DOC_TYPES.includes(type)) {
    return c.json({ error: "Invalid document type" }, 400);
  }

  // Compute SHA-256 from file bytes for dedup.
  // .arrayBuffer() on a File/Blob does NOT consume the stream — file.stream() still works after.
  const fileBuffer = await file.arrayBuffer();
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", fileBuffer));
  const sha256 = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  // Reject duplicate: same content already exists for this patient (and is live)
  const existing = await c.env.DB.prepare(
    "SELECT id, title FROM documents WHERE patient_id = ? AND sha256 = ? AND is_deleted = 0"
  ).bind(pid, sha256).first<{ id: string; title: string }>();

  if (existing) {
    return c.json({
      error: "Duplicate document",
      existing_id: existing.id,
      existing_title: existing.title,
    }, 409);
  }

  const docId = crypto.randomUUID();
  const r2Key = `patients/${pid}/documents/${docId}/${file.name}`;

  // Upload to R2
  await c.env.BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });

  // Create DB record with pending status
  await c.env.DB.prepare(
    `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
     source_lab, processing_status, sha256, uploaded_by, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).bind(
    docId, pid, type, title, documentDate, r2Key,
    file.type || "application/octet-stream", file.size,
    sourceLab ?? null, sha256, user.sub, user.sub, user.sub
  ).run();

  // Trigger Workflow
  try {
    const instance = await c.env.EXTRACTION_WORKFLOW.create({
      params: { documentId: docId, patientId: pid, userId: user.sub },
    });
    await c.env.DB.prepare(
      "UPDATE documents SET workflow_instance_id = ? WHERE id = ?"
    ).bind(instance.id, docId).run();
  } catch {
    // Workflow trigger failure is non-fatal for the upload response.
    // Set status to "failed" so the Retry button appears in the UI.
    await c.env.DB.prepare(
      "UPDATE documents SET processing_status = 'failed' WHERE id = ?"
    ).bind(docId).run();
  }

  const document = await c.env.DB.prepare(
    "SELECT id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, workflow_instance_id, created_at FROM documents WHERE id = ?"
  ).bind(docId).first();

  return c.json({ document }, 201);
});

// GET /api/patients/:pid/documents/:id/file — stream from R2
documentRoutes.get("/:id/file", async (c) => {
  const pid = c.get("patientId");
  const id = c.req.param("id");

  const download = c.req.query("download") === "1";

  const document = await c.env.DB.prepare(
    "SELECT r2_key, mime_type, title FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first<{ r2_key: string; mime_type: string; title: string }>();

  if (!document) return c.json({ error: "Document not found" }, 404);

  const r2Object = await c.env.BUCKET.get(document.r2_key);
  if (!r2Object) return c.json({ error: "File not found in storage" }, 404);

  const headers: Record<string, string> = {
    "Content-Type": document.mime_type,
    "Content-Length": r2Object.size.toString(),
  };

  if (download) {
    const ext = document.r2_key.includes(".")
      ? document.r2_key.slice(document.r2_key.lastIndexOf("."))
      : "";
    const filename = document.title.replace(/"/g, "'") + ext;
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return c.body(r2Object.body, 200, headers);
});

// GET /api/patients/:pid/documents/:id/status — processing status
documentRoutes.get("/:id/status", async (c) => {
  const pid = c.get("patientId");
  const id = c.req.param("id");

  const row = await c.env.DB.prepare(
    "SELECT id, processing_status, workflow_instance_id FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first<{ id: string; processing_status: string; workflow_instance_id: string | null }>();

  if (!row) return c.json({ error: "Document not found" }, 404);

  return c.json({
    id: row.id,
    processing_status: row.processing_status,
    workflow_instance_id: row.workflow_instance_id,
  });
});

// POST /api/patients/:pid/documents/:id/review-medication
documentRoutes.post("/:id/review-medication", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const docId = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const doc = await c.env.DB.prepare(
    `SELECT id, llm_raw_response, medication_review_status, medication_review_decisions
     FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0`
  ).bind(docId, pid).first<Record<string, unknown>>();

  if (!doc) return c.json({ error: "Document not found" }, 404);
  if (doc.medication_review_status !== "pending_review") {
    return c.json({ error: "Document is not pending review" }, 400);
  }

  const body = await c.req.json<{
    extraction_index: number;
    decision: "added" | "skipped";
    reason?: string;
    medication_data?: Record<string, unknown>;
  }>();

  const extraction = JSON.parse((doc.llm_raw_response as string) || "{}");
  const extractedMeds: Array<Record<string, unknown>> = extraction.medications ?? [];
  const extractedMed = extractedMeds[body.extraction_index];
  if (!extractedMed) return c.json({ error: "Invalid extraction_index" }, 400);

  if (body.decision === "added" && !body.medication_data) {
    return c.json({ error: "medication_data required when decision is 'added'" }, 400);
  }

  const decisions: Array<Record<string, unknown>> =
    JSON.parse((doc.medication_review_decisions as string) || "[]");

  const alreadyDecided = decisions.some((d) => d.extraction_index === body.extraction_index);
  if (alreadyDecided) {
    return c.json({ error: "This medication has already been reviewed" }, 409);
  }

  const now = new Date().toISOString();
  let medicationId: string | null = null;

  if (body.decision === "added" && body.medication_data) {
    const md = body.medication_data;
    medicationId = crypto.randomUUID();
    const startDate = (md.start_date as string) || now.slice(0, 10);
    const rxIds = JSON.stringify([docId]);
    const events = JSON.stringify([{
      event: "started",
      date: startDate,
      document_id: docId,
    }]);

    await c.env.DB.prepare(
      `INSERT INTO medications (id, patient_id, document_id, brand_name, generic_name,
         dosage, form, prescribing_doctor, start_date, end_date, reason, notes,
         prescription_ids, lifecycle_events, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      medicationId, pid, docId,
      md.brand_name ?? extractedMed.brand_name ?? "Unknown",
      md.generic_name ?? extractedMed.generic_name ?? null,
      md.dosage ?? extractedMed.dosage ?? "as prescribed",
      md.form ?? extractedMed.form ?? "other",
      md.prescribing_doctor ?? extractedMed.prescribing_doctor ?? null,
      startDate,
      md.end_date ?? null,
      md.reason ?? extractedMed.reason ?? null,
      md.notes ?? extractedMed.notes ?? null,
      rxIds, events, user.sub, user.sub,
    ).run();

    const schedules = (md.schedules ?? extractedMed.schedule ?? []) as Array<Record<string, unknown>>;
    for (const s of schedules) {
      await c.env.DB.prepare(
        `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation,
           dose_quantity, specific_time, instructions, days_of_week, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(), medicationId,
        s.time_of_day ?? "as_needed",
        s.meal_relation ?? "not_applicable",
        s.dose_quantity != null ? String(s.dose_quantity) : null,
        s.specific_time ?? null,
        s.instructions ?? null,
        s.days_of_week ?? null,
        user.sub, user.sub,
      ).run();
    }
  }

  decisions.push({
    extraction_index: body.extraction_index,
    brand_name: extractedMed.brand_name ?? extractedMed.name ?? "Unknown",
    dosage: extractedMed.dosage ?? "",
    decision: body.decision,
    ...(medicationId ? { medication_id: medicationId } : {}),
    ...(body.reason ? { reason: body.reason } : {}),
  });

  const allDecided = extractedMeds.every((_, i) => decisions.some((d) => d.extraction_index === i));
  const newStatus = allDecided ? "reviewed" : "pending_review";

  await c.env.DB.prepare(
    `UPDATE documents SET medication_review_decisions = ?, medication_review_status = ?,
       updated_at = ?, updated_by = ? WHERE id = ?`
  ).bind(JSON.stringify(decisions), newStatus, now, user.sub, docId).run();

  return c.json({
    decision: body.decision,
    medication_id: medicationId,
    review_status: newStatus,
    decisions_count: decisions.length,
    total_medications: extractedMeds.length,
  });
});

// DELETE /api/patients/:pid/documents/:id — soft delete + cascade
documentRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const document = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!document) return c.json({ error: "Document not found" }, 404);

  const now = new Date().toISOString();

  // Soft-delete the document
  await c.env.DB.prepare(
    "UPDATE documents SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE id = ?"
  ).bind(now, user.sub, now, id).run();

  // Cascade soft-delete to linked records
  await Promise.all([
    c.env.DB.prepare(
      `UPDATE test_results SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE document_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, id).run(),
    c.env.DB.prepare(
      `UPDATE vital_readings SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE document_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, id).run(),
    c.env.DB.prepare(
      `UPDATE scan_findings SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE document_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, id).run(),
    c.env.DB.prepare(
      `UPDATE clinical_notes SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE document_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, id).run(),
    c.env.DB.prepare(
      `UPDATE culture_results SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ? WHERE document_id = ? AND is_deleted = 0`
    ).bind(now, user.sub, now, id).run(),
    // Non-destructive prescription_ids cascade
    (async () => {
      const linked = await c.env.DB.prepare(
        `SELECT m.id, m.prescription_ids FROM medications m, json_each(m.prescription_ids) je
         WHERE je.value = ? AND m.patient_id = ? AND m.is_deleted = 0`
      ).bind(id, pid).all<{ id: string; prescription_ids: string }>();

      for (const med of linked.results) {
        const rxIds: string[] = JSON.parse(med.prescription_ids || "[]");
        const otherIds = rxIds.filter((d) => d !== id);
        const otherActiveDoc = otherIds.length > 0
          ? await c.env.DB.prepare(
              `SELECT id FROM documents WHERE id IN (${otherIds.map(() => "?").join(",")})
               AND is_deleted = 0 LIMIT 1`
            ).bind(...otherIds).first()
          : null;

        if (!otherActiveDoc) {
          await c.env.DB.prepare(
            `UPDATE medications SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
             WHERE id = ?`
          ).bind(now, user.sub, now, med.id).run();
        }
      }

      // Legacy: medications with no prescription_ids (pre-migration)
      await c.env.DB.prepare(
        `UPDATE medications SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
         WHERE document_id = ? AND prescription_ids = '[]' AND is_deleted = 0`
      ).bind(now, user.sub, now, id).run();
    })(),
  ]);

  return c.json({ ok: true });
});

// PATCH /api/patients/:pid/documents/:id — update title, document_date, source_lab, type
// type is locked once processing_status = 'complete'
documentRoutes.patch("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const doc = await c.env.DB.prepare(
    "SELECT id, processing_status FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first<{ id: string; processing_status: string }>();

  if (!doc) return c.json({ error: "Document not found" }, 404);

  const body = await c.req.json<{
    title?: string;
    document_date?: string;
    source_lab?: string;
    type?: string;
  }>();

  if (body.type && doc.processing_status === "complete") {
    return c.json({ error: "Document type cannot be changed after extraction is complete" }, 409);
  }

  const VALID_TYPES = ["blood_report", "scan", "ecg", "prescription", "consultation", "other"];
  if (body.type && !VALID_TYPES.includes(body.type)) {
    return c.json({ error: "Invalid document type" }, 400);
  }

  const setClauses: string[] = ["updated_by = ?", "updated_at = datetime('now')"];
  const values: unknown[] = [user.sub];

  if (body.title !== undefined) { setClauses.unshift("title = ?"); values.unshift(body.title); }
  if (body.document_date !== undefined) { setClauses.unshift("document_date = ?"); values.unshift(body.document_date); }
  if (body.source_lab !== undefined) { setClauses.unshift("source_lab = ?"); values.unshift(body.source_lab); }
  if (body.type !== undefined) { setClauses.unshift("type = ?"); values.unshift(body.type); }

  values.push(id);
  await c.env.DB.prepare(
    `UPDATE documents SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...values).run();

  const updated = await c.env.DB.prepare(
    "SELECT id, patient_id, type, title, document_date, source_lab, processing_status, workflow_instance_id, created_at, updated_at FROM documents WHERE id = ?"
  ).bind(id).first();

  return c.json({ document: updated });
});

// POST /api/patients/:pid/documents/:id/restore — restore soft-deleted + un-cascade
documentRoutes.post("/:id/restore", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const document = await c.env.DB.prepare(
    "SELECT id FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 1"
  ).bind(id, pid).first();

  if (!document) return c.json({ error: "Document not found or not deleted" }, 404);

  const now = new Date().toISOString();

  // Restore the document
  await c.env.DB.prepare(
    "UPDATE documents SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE id = ?"
  ).bind(now, id).run();

  // ── Find test_results that would violate idx_test_results_dedup if restored ──
  const conflictingRows = await c.env.DB.prepare(
    `SELECT id FROM test_results
     WHERE document_id = ?
       AND is_deleted = 1
       AND EXISTS (
         SELECT 1 FROM test_results live
         WHERE live.patient_id  = test_results.patient_id
           AND live.test_def_id = test_results.test_def_id
           AND live.date        = test_results.date
           AND live.report_file = test_results.report_file
           AND live.is_deleted  = 0
       )`
  ).bind(id).all<{ id: string }>();

  const conflictIds = conflictingRows.results.map((r) => r.id);

  // ── Restore only non-conflicting test_result rows ──
  const trExclude = conflictIds.length > 0
    ? `AND id NOT IN (${conflictIds.map(() => "?").join(",")})`
    : "";
  await c.env.DB.prepare(
    `UPDATE test_results
     SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ?
     WHERE document_id = ? AND is_deleted = 1 ${trExclude}`
  ).bind(now, id, ...conflictIds).run();

  // ── Restore all other cascaded tables (no dedup concern) ──
  await Promise.all([
    c.env.DB.prepare(
      "UPDATE vital_readings SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE document_id = ? AND is_deleted = 1"
    ).bind(now, id).run(),
    c.env.DB.prepare(
      "UPDATE scan_findings SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE document_id = ? AND is_deleted = 1"
    ).bind(now, id).run(),
    c.env.DB.prepare(
      "UPDATE clinical_notes SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE document_id = ? AND is_deleted = 1"
    ).bind(now, id).run(),
    c.env.DB.prepare(
      "UPDATE culture_results SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ? WHERE document_id = ? AND is_deleted = 1"
    ).bind(now, id).run(),
    // Restore medications linked via prescription_ids
    (async () => {
      const linked = await c.env.DB.prepare(
        `SELECT m.id, m.prescription_ids FROM medications m, json_each(m.prescription_ids) je
         WHERE je.value = ? AND m.patient_id = ? AND m.is_deleted = 1`
      ).bind(id, pid).all<{ id: string; prescription_ids: string }>();

      for (const med of linked.results) {
        await c.env.DB.prepare(
          `UPDATE medications SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ?
           WHERE id = ?`
        ).bind(now, med.id).run();
        await c.env.DB.prepare(
          `UPDATE medication_schedules SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ?
           WHERE medication_id = ? AND is_deleted = 1`
        ).bind(now, med.id).run();
      }

      // Legacy: restore medications with no prescription_ids
      await c.env.DB.prepare(
        `UPDATE medications SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, updated_at = ?
         WHERE document_id = ? AND prescription_ids = '[]' AND is_deleted = 1`
      ).bind(now, id).run();
    })(),
  ]);

  const result: Record<string, unknown> = { ok: true };
  if (conflictIds.length > 0) {
    result.skipped_test_results = conflictIds.length;
    result.warning = `${conflictIds.length} test result${conflictIds.length === 1 ? "" : "s"} could not be restored because they conflict with results from a more recent upload of the same document.`;
  }
  return c.json(result);
});

// POST /api/patients/:pid/documents/:id/reprocess — re-trigger Workflow for failed docs (admin)
documentRoutes.post("/:id/reprocess", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const document = await c.env.DB.prepare(
    "SELECT id, processing_status FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first<{ id: string; processing_status: string }>();

  if (!document) return c.json({ error: "Document not found" }, 404);

  if (document.processing_status !== "failed") {
    return c.json({ error: "Document must be in 'failed' status to reprocess" }, 409);
  }

  const now = new Date().toISOString();

  // Reset status to pending; clear prescription review state so stale decisions don't survive reprocess
  await c.env.DB.prepare(
    `UPDATE documents
     SET processing_status = 'pending',
         medication_review_status = CASE WHEN type = 'prescription' THEN NULL ELSE medication_review_status END,
         medication_review_decisions = CASE WHEN type = 'prescription' THEN '[]' ELSE medication_review_decisions END,
         updated_at = ?,
         updated_by = ?
     WHERE id = ?`
  ).bind(now, user.sub, id).run();

  // Trigger new Workflow instance
  try {
    const instance = await c.env.EXTRACTION_WORKFLOW.create({
      params: { documentId: id, patientId: pid, userId: user.sub },
    });
    await c.env.DB.prepare(
      "UPDATE documents SET workflow_instance_id = ? WHERE id = ?"
    ).bind(instance.id, id).run();
  } catch {
    // Non-fatal — document is reset to pending and can be picked up later
  }

  return c.json({ ok: true });
});
