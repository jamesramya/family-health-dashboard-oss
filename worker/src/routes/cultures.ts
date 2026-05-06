import { Hono } from "hono";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
  patientId: string;
  patientRole: string;
};

export const culturesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// GET /api/patients/:pid/cultures — sorted by collection_date desc, optional ?document_id= filter
culturesRoutes.get("/", async (c) => {
  const pid = c.get("patientId");
  const documentId = c.req.query("document_id");

  let sql = `SELECT id, document_id, patient_id, specimen_type, collection_date, result_status,
             organism, growth_quantity, sensitivities, comments, created_at, updated_at
             FROM culture_results
             WHERE patient_id = ? AND is_deleted = 0`;
  const params: unknown[] = [pid];

  if (documentId) {
    sql += " AND document_id = ?";
    params.push(documentId);
  }

  sql += " ORDER BY collection_date DESC, created_at DESC";

  const result = await c.env.DB.prepare(sql).bind(...params).all();

  const cultures = result.results.map((r) => ({
    ...r,
    sensitivities: r.sensitivities ? JSON.parse(r.sensitivities as string) : [],
  }));

  return c.json({ cultures });
});

// DELETE /api/patients/:pid/cultures/:id — soft delete (admin only)
culturesRoutes.delete("/:id", async (c) => {
  const pid = c.get("patientId");
  const patientRole = c.get("patientRole");
  const user = c.get("user");
  const id = c.req.param("id");

  if (patientRole !== "admin") {
    return c.json({ error: "Forbidden: admin role required" }, 403);
  }

  const existing = await c.env.DB.prepare(
    "SELECT id FROM culture_results WHERE id = ? AND patient_id = ? AND is_deleted = 0"
  ).bind(id, pid).first();

  if (!existing) return c.json({ error: "Culture result not found" }, 404);

  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `UPDATE culture_results SET is_deleted = 1, deleted_at = ?, deleted_by = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, user.sub, now, id).run();

  return c.json({ ok: true });
});
