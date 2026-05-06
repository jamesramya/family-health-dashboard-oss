import { Hono } from "hono";
import type { Bindings } from "../types";
import { parseVitalsText } from "../services/vitals-parser";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const vitalsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/vitals — filterable by type, date range
vitalsRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const typeFilter = c.req.query("type");
  const dateFrom = c.req.query("date_from");
  const dateTo = c.req.query("date_to");
  const limitParam = c.req.query("limit");

  let sql = `SELECT id, patient_id, document_id, type, measured_at, value_primary, value_secondary,
             value_tertiary, unit, context, notes, source, created_by, updated_by, created_at, updated_at
             FROM vital_readings
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [pid];

  if (typeFilter) {
    sql += " AND type = ?";
    params.push(typeFilter);
  }
  if (dateFrom) {
    // measured_at is a full ISO timestamp; date-only YYYY-MM-DD cutoffs are
    // expanded to start-of-day UTC so the comparison is unambiguous.
    sql += " AND measured_at >= ?";
    params.push(dateFrom.length === 10 ? `${dateFrom}T00:00:00.000Z` : dateFrom);
  }
  if (dateTo) {
    // Date-only cutoffs are expanded to end-of-day UTC; without this,
    // "measured_at <= 2026-04-29" excludes "2026-04-29T..." readings entirely.
    sql += " AND measured_at <= ?";
    params.push(dateTo.length === 10 ? `${dateTo}T23:59:59.999Z` : dateTo);
  }

  sql += " ORDER BY measured_at DESC";

  const limit = limitParam ? parseInt(limitParam, 10) : null;
  if (limit !== null && limit > 0) {
    sql += " LIMIT ?";
    params.push(limit);
  }

  const result = await c.env.DB.prepare(sql).bind(...params).all();
  return c.json({ vitals: result.results });
});

// GET /api/patients/:pid/vitals/latest — latest reading per type
vitalsRoutes.get("/latest", async (c) => {
  const pid = c.get("patientId");

  const result = await c.env.DB.prepare(`
    SELECT v.id, v.patient_id, v.type, v.measured_at, v.value_primary, v.value_secondary,
           v.value_tertiary, v.unit, v.context, v.notes, v.source
    FROM vital_readings v
    INNER JOIN (
      SELECT type, MAX(measured_at) AS max_at
      FROM vital_readings
      WHERE patient_id = ? AND is_deleted = 0
      GROUP BY type
    ) latest ON v.type = latest.type AND v.measured_at = latest.max_at
    WHERE v.patient_id = ? AND v.is_deleted = 0
  `).bind(pid, pid).all();

  return c.json({ vitals: result.results });
});

// POST /api/patients/:pid/vitals — log measurement (admin only)
vitalsRoutes.post("/", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const body = await c.req.json<{
    type: string;
    measured_at: string;
    value_primary: number;
    value_secondary?: number;
    value_tertiary?: number;
    unit: string;
    context?: string;
    notes?: string;
    source?: string;
    document_id?: string;
  }>();

  if (!body.type || !body.measured_at || body.value_primary === undefined || !body.unit) {
    return c.json({ error: "type, measured_at, value_primary, and unit are required" }, 400);
  }

  const validTypes = ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"];
  if (!validTypes.includes(body.type)) {
    return c.json({ error: `type must be one of: ${validTypes.join(", ")}` }, 400);
  }

  const id = crypto.randomUUID();
  const source = body.source ?? "manual";

  await c.env.DB.prepare(`
    INSERT INTO vital_readings
      (id, patient_id, document_id, type, measured_at, value_primary, value_secondary,
       value_tertiary, unit, context, notes, source, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, pid, body.document_id ?? null, body.type, body.measured_at,
    body.value_primary, body.value_secondary ?? null, body.value_tertiary ?? null,
    body.unit, body.context ?? null, body.notes ?? null, source,
    user.sub, user.sub
  ).run();

  const vital = await c.env.DB.prepare(
    "SELECT * FROM vital_readings WHERE id = ?"
  ).bind(id).first();

  return c.json({ vital }, 201);
});

// PUT /api/patients/:pid/vitals/:id — update (admin only)
vitalsRoutes.put("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM vital_readings WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Vital reading not found" }, 404);

  const body = await c.req.json<{
    type?: string;
    measured_at?: string;
    value_primary?: number;
    value_secondary?: number;
    value_tertiary?: number;
    unit?: string;
    context?: string;
    notes?: string;
    source?: string;
  }>();

  const now = new Date().toISOString();

  // Build dynamic UPDATE — only set fields present in the request body
  const setClauses: string[] = ["updated_by = ?", "updated_at = ?"];
  const bindValues: unknown[] = [user.sub, now];

  const fieldMap: [string, unknown][] = [
    ["type", body.type],
    ["measured_at", body.measured_at],
    ["value_primary", body.value_primary],
    ["value_secondary", body.value_secondary],
    ["value_tertiary", body.value_tertiary],
    ["unit", body.unit],
    ["context", body.context],
    ["notes", body.notes],
    ["source", body.source],
  ];

  for (const [field, value] of fieldMap) {
    if (field in body) {
      setClauses.unshift(`${field} = ?`);
      bindValues.unshift(value ?? null);
    }
  }

  bindValues.push(id);

  await c.env.DB.prepare(
    `UPDATE vital_readings SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...bindValues).run();

  const vital = await c.env.DB.prepare(
    "SELECT * FROM vital_readings WHERE id = ?"
  ).bind(id).first();

  return c.json({ vital });
});

// DELETE /api/patients/:pid/vitals/:id — soft delete (admin only)
vitalsRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM vital_readings WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Vital reading not found" }, 404);

  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE vital_readings SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, user.sub, now, id).run();

  return c.json({ ok: true });
});

// POST /api/patients/:pid/vitals/import — CSV bulk import (admin only)
vitalsRoutes.post("/import", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const body = await c.req.parseBody();
  const file = body["file"] as File | undefined;

  if (!file) {
    return c.json({ error: "file is required" }, 400);
  }

  const csvText = await file.text();
  const lines = csvText.trim().split("\n");

  if (lines.length < 2) {
    return c.json({ error: "CSV must have a header row and at least one data row" }, 400);
  }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const requiredHeaders = ["type", "measured_at", "value_primary", "unit"];
  for (const req of requiredHeaders) {
    if (!headers.includes(req)) {
      return c.json({ error: `CSV missing required column: ${req}` }, 400);
    }
  }

  const validTypes = ["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"];
  const imported: string[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });

    if (!validTypes.includes(row.type)) {
      errors.push(`Row ${i}: invalid type "${row.type}"`);
      continue;
    }

    if (!row.measured_at || !row.value_primary || !row.unit) {
      errors.push(`Row ${i}: missing required fields`);
      continue;
    }

    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(`
        INSERT INTO vital_readings
          (id, patient_id, type, measured_at, value_primary, value_secondary, unit, source, created_by, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'csv_import', ?, ?)
      `).bind(
        id, pid, row.type, row.measured_at, parseFloat(row.value_primary),
        row.value_secondary ? parseFloat(row.value_secondary) : null,
        row.unit, user.sub, user.sub
      ).run();
      imported.push(id);
    } catch {
      errors.push(`Row ${i}: database insert failed`);
    }
  }

  return c.json({ imported: imported.length, errors }, errors.length > 0 ? 207 : 201);
});

// POST /api/patients/:pid/vitals/parse — NLP → structured JSON (admin only)
// Primary: Gemini 2.0 Flash · Fallback: GPT-4.1 nano (requires OPENAI_API_KEY secret)
vitalsRoutes.post("/parse", async (c) => {
  const patientRole = c.get("patientRole");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const body = await c.req.json<{ text: string; timezone?: string; localDate?: string }>();
  if (!body.text) {
    return c.json({ error: "text is required" }, 400);
  }

  if (!c.env.GOOGLE_API_KEY) {
    return c.json({ error: "GOOGLE_API_KEY not configured on server" }, 500);
  }

  try {
    const vitals = await parseVitalsText(body.text, c.env, body.timezone, body.localDate);
    return c.json({ vitals });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Parsing failed: ${message}` }, 502);
  }
});
