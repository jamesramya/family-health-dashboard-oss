import type { Context, Next } from "hono";
import { sha256hex } from "../services/crypto";
import { safeWaitUntil } from "../services/wait-until";
import type { Bindings } from "../types";

export type TokenUser = {
  userId: string;
  tokenId: string;
  tokenName: string;
  scopes: string;
  accessiblePatients: Array<{ patientId: string; role: string }>;
  isAdmin: boolean;
  clientId: string | null;
  issuedVia: "pat" | "oauth";
};

export type TokenAuthVariables = { tokenUser: TokenUser };

function setAuthChallenge(c: Context, origin: string) {
  c.header("WWW-Authenticate", `Bearer realm="mcp", resource_metadata="${origin}/.well-known/oauth-protected-resource"`);
}

export async function tokenAuthMiddleware(c: Context<{ Bindings: Bindings; Variables: TokenAuthVariables }>, next: Next) {
  const origin = c.env.CORS_ORIGIN ?? new URL(c.req.url).origin;
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    setAuthChallenge(c, origin);
    return c.json({ error: "token_missing" }, 401);
  }

  const rawToken = authHeader.slice("Bearer ".length);

  if (!rawToken.startsWith("mcp_")) {
    setAuthChallenge(c, origin);
    return c.json({ error: "token_invalid" }, 401);
  }

  const tokenHash = await sha256hex(rawToken);

  const row = await c.env.DB.prepare(
    "SELECT id, user_id, name, scopes, revoked_at, expires_at, last_used_at, client_id, issued_via FROM personal_access_tokens WHERE token_hash = ?"
  ).bind(tokenHash).first<{
    id: string;
    user_id: string;
    name: string;
    scopes: string;
    revoked_at: string | null;
    expires_at: string | null;
    last_used_at: string | null;
    client_id: string | null;
    issued_via: "pat" | "oauth";
  }>();

  if (!row) {
    setAuthChallenge(c, origin);
    return c.json({ error: "token_invalid" }, 401);
  }

  if (row.revoked_at !== null) {
    setAuthChallenge(c, origin);
    return c.json({ error: "token_revoked" }, 401);
  }

  if (row.expires_at !== null) {
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      setAuthChallenge(c, origin);
      return c.json({ error: "token_expired" }, 401);
    }
  }

  const rateLimitResult = await c.env.RATE_LIMITER.limit({ key: tokenHash });
  if (!rateLimitResult.success) {
    return c.json({ error: "rate_limit_exceeded" }, 429);
  }

  const userRow = await c.env.DB.prepare(
    "SELECT is_super_admin FROM users WHERE id = ?"
  ).bind(row.user_id).first<{ is_super_admin: number }>();

  const isAdmin = userRow?.is_super_admin === 1;

  let accessiblePatients: Array<{ patientId: string; role: string }>;

  if (isAdmin) {
    const patients = await c.env.DB.prepare(
      "SELECT id AS patientId FROM patient WHERE is_deleted = 0"
    ).all<{ patientId: string }>();
    accessiblePatients = (patients.results ?? []).map((p) => ({ patientId: p.patientId, role: "admin" }));
  } else {
    const access = await c.env.DB.prepare(
      "SELECT patient_id AS patientId, role FROM user_patient_access WHERE user_id = ?"
    ).bind(row.user_id).all<{ patientId: string; role: string }>();
    accessiblePatients = access.results ?? [];
  }

  const tokenUser: TokenUser = {
    userId: row.user_id,
    tokenId: row.id,
    tokenName: row.name,
    scopes: row.scopes,
    accessiblePatients,
    isAdmin,
    clientId: row.client_id,
    issuedVia: row.issued_via,
  };

  c.set("tokenUser", tokenUser);

  safeWaitUntil(
    c,
    c.env.DB.prepare(
      "UPDATE personal_access_tokens SET last_used_at = datetime('now') WHERE id = ? AND (last_used_at IS NULL OR last_used_at < datetime('now', '-60 seconds'))"
    ).bind(row.id).run()
  );

  await next();
}

export async function logAccess(
  db: D1Database,
  entry: {
    tokenId: string;
    patientId?: string | null;
    tool: string;
    kind: "read" | "write" | "dry-run";
    statusCode: number;
    errorCode?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO external_api_access_log (id, token_id, patient_id, tool, kind, status_code, error_code, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      crypto.randomUUID(),
      entry.tokenId,
      entry.patientId ?? null,
      entry.tool,
      entry.kind,
      entry.statusCode,
      entry.errorCode ?? null,
      entry.ip ?? null,
      entry.userAgent ?? null
    )
    .run()
    .catch((err) => console.error("[logAccess] failed to write access log", err));
}
