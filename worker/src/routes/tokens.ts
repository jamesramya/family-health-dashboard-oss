import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../types";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const oauthClientRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
oauthClientRoutes.use("*", authMiddleware);

// GET /api/user/oauth-clients — list active OAuth clients for the authenticated user
oauthClientRoutes.get("/", async (c) => {
  const userId = c.get("user").sub;
  const result = await c.env.DB.prepare(
    `SELECT
       oc.id,
       oc.client_name,
       oc.created_at,
       MAX(pat.last_used_at) AS last_used_at,
       CASE WHEN EXISTS (
         SELECT 1 FROM personal_access_tokens p2
         WHERE p2.client_id = oc.id AND p2.user_id = ? AND p2.revoked_at IS NULL
           AND (
             p2.scopes = 'write'
             OR p2.scopes LIKE 'write,%'
             OR p2.scopes LIKE '%,write'
             OR p2.scopes LIKE '%,write,%'
           )
       ) THEN 'mcp.read mcp.write' ELSE 'mcp.read' END AS scopes
     FROM oauth_clients oc
     JOIN personal_access_tokens pat ON pat.client_id = oc.id AND pat.user_id = ? AND pat.revoked_at IS NULL
     GROUP BY oc.id
     ORDER BY COALESCE(MAX(pat.last_used_at), MAX(pat.created_at)) DESC`
  ).bind(userId, userId).all();
  return c.json({ clients: result.results });
});

// GET /api/user/oauth-clients/log — paginated access log filtered by OAuth client
oauthClientRoutes.get("/log", async (c) => {
  const userId = c.get("user").sub;
  const clientId = c.req.query("clientId");
  const patientId = c.req.query("patientId");
  const raw = parseInt(c.req.query("page") ?? "0", 10);
  const page = Number.isFinite(raw) && raw >= 0 ? Math.min(raw, 9999) : 0;
  const pageSize = 50;
  const offset = page * pageSize;

  let where = "WHERE pat.user_id = ?";
  const params: unknown[] = [userId];

  if (clientId) {
    where += " AND oc.id = ?";
    params.push(clientId);
  }
  if (patientId) {
    where += " AND l.patient_id = ?";
    params.push(patientId);
  }

  const entriesSql = `
    SELECT
      l.id, l.created_at,
      oc.id AS oauth_client_id, oc.client_name AS oauth_client_name,
      l.patient_id, pt.name AS patient_name,
      l.tool, l.kind, l.status_code, l.error_code, l.ip
    FROM external_api_access_log l
    JOIN personal_access_tokens pat ON pat.id = l.token_id
    JOIN oauth_clients oc ON oc.id = pat.client_id
    LEFT JOIN patient pt ON pt.id = l.patient_id
    ${where}
    ORDER BY l.created_at DESC
    LIMIT ${pageSize} OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM external_api_access_log l
    JOIN personal_access_tokens pat ON pat.id = l.token_id
    JOIN oauth_clients oc ON oc.id = pat.client_id
    ${where}
  `;

  const [entries, countRow] = await Promise.all([
    c.env.DB.prepare(entriesSql).bind(...params, offset).all(),
    c.env.DB.prepare(countSql).bind(...params).first<{ total: number }>(),
  ]);

  return c.json({ entries: entries.results, total: countRow?.total ?? 0 });
});

// DELETE /api/user/oauth-clients/:client_id — revoke all tokens for a client
oauthClientRoutes.delete("/:client_id", async (c) => {
  const userId = c.get("user").sub;
  const clientId = c.req.param("client_id");

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE personal_access_tokens SET revoked_at = datetime('now') WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL"
    ).bind(clientId, userId),
    c.env.DB.prepare(
      "UPDATE oauth_refresh_tokens SET revoked_at = datetime('now') WHERE client_id = ? AND user_id = ? AND revoked_at IS NULL"
    ).bind(clientId, userId),
  ]);

  return c.json({ revoked: true });
});
