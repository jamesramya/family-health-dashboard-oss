import { Hono } from "hono";
import type { Bindings } from "../types";
import { sha256hex } from "../services/crypto";

type Variables = {
  user: { sub: string; role: string; email: string };
};

type ShareResolution =
  | { ok: true; patientId: string }
  | { ok: false; status: 404 | 410 };

async function resolveShare(
  env: Bindings,
  rawToken: string
): Promise<ShareResolution> {
  const tokenHash = await sha256hex(rawToken);
  const link = await env.DB.prepare(
    "SELECT patient_ids, expires_at, revoked_at FROM share_links WHERE token_hash = ?"
  ).bind(tokenHash).first<{
    patient_ids: string;
    expires_at: string | null;
    revoked_at: string | null;
  }>();
  if (!link) return { ok: false, status: 404 };
  if (link.revoked_at) return { ok: false, status: 404 };
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return { ok: false, status: 410 };
  }
  const patientIds: string[] = JSON.parse(link.patient_ids);
  const patientId = patientIds[0];
  if (!patientId) return { ok: false, status: 404 };
  return { ok: true, patientId };
}

// Public routes — no auth required
export const publicShareRoutes = new Hono<{ Bindings: Bindings }>();

// GET /api/share/:token — resolve a share link and return scoped patient data
publicShareRoutes.get("/:token", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const patient = await c.env.DB.prepare(
    "SELECT id, name, date_of_birth, gender, blood_type FROM patient WHERE id = ? AND is_deleted = 0"
  ).bind(r.patientId).first<{
    id: string;
    name: string;
    date_of_birth: string;
    gender: string;
    blood_type: string | null;
  }>();

  if (!patient) return c.json({ error: "Not found" }, 404);

  // Most recent test results
  const testResults = await c.env.DB.prepare(
    `SELECT tr.date, td.label, td.unit, tr.value, tr.value_text, tr.flag
     FROM test_results tr
     JOIN test_definitions td ON td.id = tr.test_def_id
     WHERE tr.patient_id = ? AND tr.is_deleted = 0
     ORDER BY tr.date DESC
     LIMIT 20`
  ).bind(r.patientId).all();

  // Most recent vitals
  const vitals = await c.env.DB.prepare(
    `SELECT type, measured_at, value_primary, value_secondary, unit
     FROM vital_readings
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY measured_at DESC
     LIMIT 10`
  ).bind(r.patientId).all();

  return c.json({
    patient,
    test_results: testResults.results,
    vitals: vitals.results,
  });
});

type LabDef = { id: string; canonical_name: string; label: string; unit: string; category: string; ref_low: number | null; ref_high: number | null; sort_order: number };
type LabReading = { id: string; test_def_id: string; date: string; value: number | null; value_text: string | null; flag: string; ref_low_at_test: number | null; ref_high_at_test: number | null };

publicShareRoutes.get("/:token/labs", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const defs = await c.env.DB.prepare(
    `SELECT id, canonical_name, label, unit, category, ref_low, ref_high, sort_order
     FROM test_definitions WHERE is_deleted = 0
     ORDER BY category, sort_order ASC`
  ).all<LabDef>();

  const readings = await c.env.DB.prepare(
    `SELECT id, test_def_id, date, value, value_text, flag,
            ref_low_at_test, ref_high_at_test
     FROM test_results
     WHERE patient_id = ? AND is_deleted = 0
     ORDER BY date DESC`
  ).bind(r.patientId).all<LabReading>();

  const readingsByDef = new Map<string, LabReading[]>();
  for (const reading of readings.results) {
    if (!readingsByDef.has(reading.test_def_id)) readingsByDef.set(reading.test_def_id, []);
    readingsByDef.get(reading.test_def_id)!.push(reading);
  }
  const categoryMap = new Map<string, LabDef[]>();
  for (const def of defs.results) {
    if (!categoryMap.has(def.category)) categoryMap.set(def.category, []);
    categoryMap.get(def.category)!.push(def);
  }
  const categories = Array.from(categoryMap.entries()).map(([category, ds]) => ({
    category,
    tests: ds
      .filter((d) => (readingsByDef.get(d.id)?.length ?? 0) > 0)
      .map((d) => ({ ...d, readings: readingsByDef.get(d.id) ?? [], report_file: null })),
  }));

  return c.json({ categories });
});

publicShareRoutes.get("/:token/vitals", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const type = c.req.query("type");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");

  let sql = `SELECT id, type, measured_at, value_primary, value_secondary, unit
             FROM vital_readings
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [r.patientId];
  if (type) { sql += " AND type = ?"; params.push(type); }
  if (dateFrom) { sql += " AND measured_at >= ?"; params.push(dateFrom.length === 10 ? `${dateFrom}T00:00:00.000Z` : dateFrom); }
  if (dateTo) { sql += " AND measured_at <= ?"; params.push(dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo); }
  sql += " ORDER BY measured_at DESC";

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ vitals: result.results });
});

publicShareRoutes.get("/:token/medications", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  type MedRow = {
    id: string; brand_name: string; generic_name: string | null; dosage: string; form: string;
    prescribing_doctor: string | null; start_date: string; end_date: string | null;
    reason: string | null; notes: string | null; is_active: number;
    time_of_day: string | null; dose_quantity: string | null; meal_relation: string | null;
  };
  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.brand_name, m.generic_name, m.dosage, m.form, m.prescribing_doctor,
            m.start_date, m.end_date, m.reason, m.notes, m.is_active,
            ms.time_of_day, ms.dose_quantity, ms.meal_relation
     FROM medications m
     LEFT JOIN medication_schedules ms ON ms.medication_id = m.id AND ms.is_deleted = 0
     WHERE m.patient_id = ? AND m.is_deleted = 0
     ORDER BY m.is_active DESC, m.start_date DESC`
  ).bind(r.patientId).all<MedRow>();

  const medMap = new Map<string, { id: string; brand_name: string; generic_name: string | null; dosage: string; form: string; prescribing_doctor: string | null; start_date: string; end_date: string | null; reason: string | null; notes: string | null; is_active: number; schedules: { time_of_day: string; dose_quantity: string | null; meal_relation: string }[] }>();
  for (const row of rows.results) {
    if (!medMap.has(row.id)) {
      const { time_of_day, dose_quantity, meal_relation, ...med } = row;
      medMap.set(row.id, { ...med, schedules: [] });
    }
    if (row.time_of_day) {
      medMap.get(row.id)!.schedules.push({ time_of_day: row.time_of_day, dose_quantity: row.dose_quantity, meal_relation: row.meal_relation! });
    }
  }

  return c.json({ medications: Array.from(medMap.values()) });
});

publicShareRoutes.get("/:token/scans", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const scanType = c.req.query("scan_type");
  let sql = `SELECT id, scan_type, body_area, findings_summary, impression, ordering_doctor, scan_date
             FROM scan_findings
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [r.patientId];
  if (scanType) { sql += " AND scan_type = ?"; params.push(scanType); }
  sql += " ORDER BY scan_date DESC";
  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ scans: result.results });
});

publicShareRoutes.get("/:token/documents", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const typeFilter = c.req.query("type");
  let sql = `SELECT id, type, title, document_date, mime_type, file_size_bytes, source_lab
             FROM documents WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [r.patientId];
  if (typeFilter) { sql += " AND type = ?"; params.push(typeFilter); }
  sql += " ORDER BY document_date DESC, created_at DESC";
  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ documents: result.results });
});

publicShareRoutes.get("/:token/documents/:docId/file", async (c) => {
  const r = await resolveShare(c.env, c.req.param("token"));
  if (!r.ok) return c.json({ error: r.status === 410 ? "Gone" : "Not found" }, r.status);

  const docId = c.req.param("docId");
  const doc = await c.env.DB.prepare(
    "SELECT r2_key, mime_type, title FROM documents WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(docId, r.patientId).first<{ r2_key: string; mime_type: string; title: string }>();
  if (!doc) return c.json({ error: "Not found" }, 404);

  const obj = await c.env.BUCKET.get(doc.r2_key);
  if (!obj) return c.json({ error: "File not found in storage" }, 404);

  return c.body(obj.body, 200, {
    "Content-Type": doc.mime_type,
    "Content-Length": obj.size.toString(),
    "Content-Disposition": "inline",
  });
});

// Admin-gated routes — auth + requireSuperAdmin applied in index.ts
export const shareLinkAdminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// POST /api/share-links — create a share link
shareLinkAdminRoutes.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json<{
    patient_ids: string[];
    expires_in_days: number | null;
    scopes?: string[];
  }>();

  if (!body.patient_ids || !Array.isArray(body.patient_ids) || body.patient_ids.length === 0) {
    return c.json({ error: "patient_ids is required" }, 400);
  }
  if (body.expires_in_days !== null && body.expires_in_days !== undefined && typeof body.expires_in_days !== "number") {
    return c.json({ error: "expires_in_days must be a number or null" }, 400);
  }

  const scopes = body.scopes ?? ["read"];
  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256hex(rawToken);
  const id = crypto.randomUUID();
  const expiresAt = body.expires_in_days != null
    ? new Date(Date.now() + body.expires_in_days * 24 * 3600 * 1000).toISOString()
    : null;

  const link = `/share/${rawToken}`;

  await c.env.DB.prepare(
    `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by, link)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    tokenHash,
    JSON.stringify(body.patient_ids),
    JSON.stringify(scopes),
    expiresAt,
    user.sub,
    link
  ).run();

  return c.json({ id, token: rawToken, link, expires_at: expiresAt }, 201);
});

// GET /api/share-links — list active links created by current user
shareLinkAdminRoutes.get("/", async (c) => {
  const user = c.get("user");
  const result = await c.env.DB.prepare(
    `SELECT id, patient_ids, scopes, expires_at, created_at, link
     FROM share_links
     WHERE created_by = ? AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > datetime('now'))
     ORDER BY created_at DESC`
  ).bind(user.sub).all();

  return c.json({ links: result.results });
});

// DELETE /api/share-links/:id — revoke a link
shareLinkAdminRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const link = await c.env.DB.prepare(
    "SELECT id FROM share_links WHERE id = ? AND created_by = ?"
  ).bind(id, user.sub).first<{ id: string }>();

  if (!link) return c.json({ error: "Not found" }, 404);

  await c.env.DB.prepare(
    "UPDATE share_links SET revoked_at = datetime('now') WHERE id = ?"
  ).bind(id).run();

  return c.json({ ok: true });
});
