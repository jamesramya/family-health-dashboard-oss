import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const scansRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/scans — sorted by scan_date desc, optional ?document_id= filter
scansRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const documentId = c.req.query("document_id");

  let sql = `SELECT id, patient_id, document_id, scan_type, body_area, findings_summary,
             impression, ordering_doctor, scan_date, created_by, updated_by, created_at, updated_at
             FROM scan_findings
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [pid];

  if (documentId) {
    sql += " AND document_id = ?";
    params.push(documentId);
  }

  sql += " ORDER BY scan_date DESC";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  return c.json({ scans: result.results });
});

// PUT /api/patients/:pid/scans/:id — update (admin only)
scansRoutes.put("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM scan_findings WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Scan not found" }, 404);

  const body = await c.req.json<{
    scan_type?: string;
    body_area?: string;
    findings_summary?: string;
    impression?: string;
    ordering_doctor?: string;
    scan_date?: string;
  }>();

  const now = new Date().toISOString();

  // Build dynamic UPDATE — only set fields present in the request body
  const setClauses: string[] = ["updated_by = ?", "updated_at = ?"];
  const bindValues: unknown[] = [user.sub, now];

  const fieldMap: [string, unknown][] = [
    ["scan_type", body.scan_type],
    ["body_area", body.body_area],
    ["findings_summary", body.findings_summary],
    ["impression", body.impression],
    ["ordering_doctor", body.ordering_doctor],
    ["scan_date", body.scan_date],
  ];

  for (const [field, value] of fieldMap) {
    if (field in body) {
      setClauses.unshift(`${field} = ?`);
      bindValues.unshift(value ?? null);
    }
  }

  bindValues.push(id);

  await c.env.DB.prepare(
    `UPDATE scan_findings SET ${setClauses.join(", ")} WHERE id = ?`
  ).bind(...bindValues).run();

  const scan = await c.env.DB.prepare(
    "SELECT * FROM scan_findings WHERE id = ?"
  ).bind(id).first();

  return c.json({ scan });
});

// DELETE /api/patients/:pid/scans/:id — soft delete (admin only)
scansRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM scan_findings WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Scan not found" }, 404);

  const now = new Date().toISOString();

  await c.env.DB.prepare(`
    UPDATE scan_findings SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
    WHERE id = ?
  `).bind(now, user.sub, now, id).run();

  return c.json({ ok: true });
});
