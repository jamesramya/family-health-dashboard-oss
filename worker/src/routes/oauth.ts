import { Hono } from "hono";
import type { Bindings } from "../types";
import { isRedirectUriRegistered, verifyPkceS256, mapOAuthScopeToPat, mintTokenBytes } from "../services/oauth";
import { authMiddleware } from "../middleware/auth";
import { sha256hex } from "../services/crypto";
import type { DecodedToken } from "../services/jwt";

// Use CORS_ORIGIN (the Pages URL) as the canonical app origin.
// c.req.url resolves to the Worker's own workers.dev URL when called via the Pages proxy,
// so URLs built from it would advertise the wrong host to OAuth clients.
function getAppOrigin(c: { env: Bindings; req: { url: string } }): string {
  return c.env.CORS_ORIGIN ?? new URL(c.req.url).origin;
}

const oauthWellKnown = new Hono<{ Bindings: Bindings }>();

oauthWellKnown.get("/oauth-authorization-server", (c) => {
  const origin = getAppOrigin(c);
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp.read", "mcp.write"],
  });
});

oauthWellKnown.get("/oauth-protected-resource", (c) => {
  const origin = getAppOrigin(c);
  return c.json({
    resource: `${origin}/mcp`,
    authorization_servers: [origin],
    scopes_supported: ["mcp.read", "mcp.write"],
    bearer_methods_supported: ["header"],
  });
});

const oauthRoutes = new Hono<{ Bindings: Bindings }>();

oauthRoutes.post("/register", async (c) => {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const rateLimit = await c.env.RATE_LIMITER.limit({ key: `register:${ip}` });
  if (!rateLimit.success) {
    return c.json({ error: "rate_limit_exceeded" }, 429);
  }

  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "invalid_request", error_description: "Invalid JSON body" }, 400);

  if (!body.client_name || typeof body.client_name !== "string" || !body.client_name.trim()) {
    return c.json({ error: "invalid_client_metadata", error_description: "client_name is required" }, 400);
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be a non-empty array" }, 400);
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return c.json({ error: "invalid_redirect_uri", error_description: "All redirect_uris must be strings" }, 400);
    }
    let parsed: URL;
    try { parsed = new URL(uri); } catch {
      return c.json({ error: "invalid_redirect_uri", error_description: `Invalid URI: ${uri}` }, 400);
    }
    const scheme = parsed.protocol;
    const forbiddenSchemes = new Set(["javascript:", "data:", "file:", "blob:", "vbscript:", "about:"]);
    const isHttps = scheme === "https:";
    const isLocalHttp = scheme === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    const isCustomApp = !forbiddenSchemes.has(scheme) && scheme !== "https:" && scheme !== "http:" && uri.includes("://");
    if (!isHttps && !isLocalHttp && !isCustomApp) {
      return c.json({ error: "invalid_redirect_uri", error_description: `Forbidden URI scheme: ${scheme}` }, 400);
    }
  }

  if (body.token_endpoint_auth_method !== undefined && body.token_endpoint_auth_method !== "none") {
    return c.json({ error: "invalid_client_metadata", error_description: "Only token_endpoint_auth_method=none is supported" }, 400);
  }

  const allowedGrants = new Set(["authorization_code", "refresh_token"]);
  const grantTypes = body.grant_types;
  if (grantTypes !== undefined) {
    if (!Array.isArray(grantTypes) || grantTypes.length === 0 || grantTypes.some((g) => !allowedGrants.has(g as string))) {
      return c.json({ error: "invalid_client_metadata", error_description: "Unsupported grant_type" }, 400);
    }
  }

  const clientId = crypto.randomUUID();
  const finalGrantTypes = Array.isArray(grantTypes) ? grantTypes.join(",") : "authorization_code,refresh_token";
  const finalResponseTypes = "code";
  const finalAuthMethod = "none";
  const finalScope = typeof body.scope === "string" ? body.scope : "mcp.read";

  await c.env.DB.prepare(
    `INSERT INTO oauth_clients (id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    clientId,
    body.client_name.trim(),
    JSON.stringify(redirectUris),
    finalGrantTypes,
    finalResponseTypes,
    finalAuthMethod,
    finalScope
  ).run();

  return c.json({
    client_id: clientId,
    client_name: body.client_name.trim(),
    redirect_uris: redirectUris,
    grant_types: finalGrantTypes.split(","),
    response_types: [finalResponseTypes],
    token_endpoint_auth_method: finalAuthMethod,
    scope: finalScope,
  }, 201);
});

oauthRoutes.get("/authorize", async (c) => {
  const q = c.req.query();
  const { client_id, redirect_uri, response_type, scope, state, code_challenge, code_challenge_method, resource } = q;

  if (!client_id) {
    return c.json({ error: "invalid_client", error_description: "client_id is required" }, 400);
  }
  const client = await c.env.DB.prepare(
    "SELECT id, redirect_uris FROM oauth_clients WHERE id = ?"
  ).bind(client_id).first<{ id: string; redirect_uris: string }>();
  if (!client) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  if (!redirect_uri || !isRedirectUriRegistered(client.redirect_uris, redirect_uri)) {
    return c.json({ error: "invalid_client", error_description: "redirect_uri not registered for this client" }, 400);
  }

  const redirectError = (error: string, description: string) => {
    const url = new URL(redirect_uri);
    url.searchParams.set("error", error);
    if (state) url.searchParams.set("state", state);
    url.searchParams.set("error_description", description);
    return c.redirect(url.toString(), 302);
  };

  if (response_type !== "code") {
    return redirectError("unsupported_response_type", "Only response_type=code is supported");
  }

  if (!state) {
    return redirectError("invalid_request", "state is required");
  }

  if (!code_challenge) {
    return redirectError("invalid_request", "code_challenge is required");
  }
  if (!/^[A-Za-z0-9\-_]{43,128}$/.test(code_challenge)) {
    return redirectError("invalid_request", "code_challenge must be 43-128 base64url characters");
  }

  if (code_challenge_method !== "S256") {
    return redirectError("invalid_request", "Only code_challenge_method=S256 is supported");
  }

  const validScopes = new Set(["mcp.read", "mcp.write mcp.read", "mcp.read mcp.write"]);
  const effectiveScope = scope ?? "mcp.read";
  if (!validScopes.has(effectiveScope)) {
    return redirectError("invalid_scope", `Scope not supported: ${effectiveScope}`);
  }

  const origin = getAppOrigin(c);
  if (resource !== `${origin}/mcp`) {
    return redirectError("invalid_target", `resource must be ${origin}/mcp`);
  }

  const url = new URL(c.req.url);
  return c.redirect(`/oauth/authorize?${url.searchParams.toString()}`, 302);
});

oauthRoutes.post("/token", async (c) => {
  const body = await c.req.parseBody() as Record<string, string>;
  const { grant_type, client_id } = body;

  const noStore = () => c.header("Cache-Control", "no-store");
  const tokenError = (error: string, error_description: string, status: 400 | 429 = 400) => {
    noStore();
    return c.json({ error, error_description }, status);
  };

  if (!client_id) {
    noStore();
    return c.json({ error: "invalid_request", error_description: "client_id is required" }, 400);
  }

  const rateLimit = await c.env.RATE_LIMITER.limit({ key: `token:${client_id}` });
  if (!rateLimit.success) {
    noStore();
    return c.json({ error: "rate_limit_exceeded" }, 429);
  }

  if (grant_type === "authorization_code") {
    const { code, redirect_uri, code_verifier, resource } = body;

    if (!code || !redirect_uri || !code_verifier || !resource) {
      return tokenError("invalid_request", "Missing required parameter");
    }

    const code_hash = await sha256hex(code);

    // Fetch and validate before consuming — consuming a code on bad params would burn it unnecessarily
    const row = await c.env.DB.prepare(
      "SELECT * FROM oauth_auth_codes WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > datetime('now')"
    ).bind(code_hash).first<{
      code_hash: string;
      client_id: string;
      user_id: string;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      resource: string;
      expires_at: string;
    }>();

    if (!row) {
      return tokenError("invalid_grant", "Authorization code not found, expired, or already used");
    }

    if (row.redirect_uri !== redirect_uri) {
      return tokenError("invalid_grant", "redirect_uri mismatch");
    }
    if (row.client_id !== client_id) {
      return tokenError("invalid_grant", "client_id mismatch");
    }
    if (row.resource !== resource) {
      return tokenError("invalid_grant", "resource mismatch");
    }

    // PKCE verification
    const pkceValid = await verifyPkceS256(code_verifier, row.code_challenge);
    if (!pkceValid) {
      return tokenError("invalid_grant", "PKCE verification failed");
    }

    // Atomic single-use consumption — prevents replay in concurrent requests
    const consumed = await c.env.DB.prepare(
      "UPDATE oauth_auth_codes SET consumed_at = datetime('now') WHERE code_hash = ? AND consumed_at IS NULL"
    ).bind(code_hash).run();

    if (consumed.meta.changes === 0) {
      return tokenError("invalid_grant", "Authorization code already used");
    }

    // Mint access token
    const access_token = "mcp_" + mintTokenBytes();
    const access_token_hash = await sha256hex(access_token);
    let patScope: string;
    try {
      patScope = mapOAuthScopeToPat(row.scope);
    } catch {
      return tokenError("invalid_grant", "Invalid scope in authorization code");
    }
    const patId = crypto.randomUUID();
    const tokenName = `oauth:${patId}`;
    const token_prefix = access_token.slice(0, 10);
    const token_suffix = access_token.slice(-4);

    await c.env.DB.prepare(
      `INSERT INTO personal_access_tokens
         (id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, issued_via, client_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'oauth', datetime('now'), 'oauth', ?, datetime('now', '+14 days'))`
    ).bind(patId, row.user_id, tokenName, access_token_hash, token_prefix, token_suffix, patScope, row.client_id).run();

    // Mint refresh token
    const refresh_token = "mcr_" + mintTokenBytes();
    const refresh_hash = await sha256hex(refresh_token);
    const refreshId = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
         (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 days'))`
    ).bind(refreshId, refresh_hash, patId, row.client_id, row.user_id, row.scope, row.resource).run();

    noStore();
    return c.json({
      access_token,
      token_type: "Bearer",
      expires_in: 1209600,
      refresh_token,
      scope: row.scope,
    });
  }

  if (grant_type === "refresh_token") {
    const { refresh_token } = body;

    if (!refresh_token) {
      return tokenError("invalid_request", "refresh_token is required");
    }

    const token_hash = await sha256hex(refresh_token);

    const row = await c.env.DB.prepare(
      "SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?"
    ).bind(token_hash).first<{
      id: string;
      token_hash: string;
      access_token_id: string;
      client_id: string;
      user_id: string;
      scope: string;
      resource: string;
      expires_at: string;
      rotated_to: string | null;
      revoked_at: string | null;
    }>();

    if (!row) {
      return tokenError("invalid_grant", "Refresh token not found");
    }

    // Theft detection: revoked + already rotated away → cascade revoke
    if (row.revoked_at !== null && row.rotated_to !== null) {
      await c.env.DB.prepare(
        "UPDATE personal_access_tokens SET revoked_at = datetime('now') WHERE client_id = ? AND user_id = ? AND issued_via = 'oauth'"
      ).bind(row.client_id, row.user_id).run();
      await c.env.DB.prepare(
        "UPDATE oauth_refresh_tokens SET revoked_at = datetime('now') WHERE client_id = ? AND user_id = ?"
      ).bind(row.client_id, row.user_id).run();
      return tokenError("invalid_grant", "Refresh token reuse detected");
    }

    if (row.revoked_at !== null) {
      return tokenError("invalid_grant", "Refresh token has been revoked");
    }

    // Expiry check
    const notExpired = await c.env.DB.prepare(
      "SELECT 1 FROM oauth_refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')"
    ).bind(token_hash).first();
    if (!notExpired) {
      return tokenError("invalid_grant", "Refresh token expired");
    }

    if (row.client_id !== client_id) {
      return tokenError("invalid_grant", "client_id mismatch");
    }

    // Revoke old PAT
    await c.env.DB.prepare(
      "UPDATE personal_access_tokens SET revoked_at = datetime('now') WHERE id = ?"
    ).bind(row.access_token_id).run();

    // Mint new access token
    const access_token = "mcp_" + mintTokenBytes();
    const access_token_hash = await sha256hex(access_token);
    let patScope: string;
    try {
      patScope = mapOAuthScopeToPat(row.scope);
    } catch {
      return tokenError("invalid_grant", "Invalid scope in refresh token");
    }
    const newPatId = crypto.randomUUID();
    const tokenName = `oauth:${newPatId}`;
    const token_prefix = access_token.slice(0, 10);
    const token_suffix = access_token.slice(-4);

    await c.env.DB.prepare(
      `INSERT INTO personal_access_tokens
         (id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, issued_via, client_id, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'oauth', datetime('now'), 'oauth', ?, datetime('now', '+14 days'))`
    ).bind(newPatId, row.user_id, tokenName, access_token_hash, token_prefix, token_suffix, patScope, row.client_id).run();

    // Mint new refresh token
    const new_refresh_token = "mcr_" + mintTokenBytes();
    const new_refresh_hash = await sha256hex(new_refresh_token);
    const newRefreshId = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
         (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 days'))`
    ).bind(newRefreshId, new_refresh_hash, newPatId, row.client_id, row.user_id, row.scope, row.resource).run();

    // Rotate old refresh token
    await c.env.DB.prepare(
      "UPDATE oauth_refresh_tokens SET revoked_at = datetime('now'), rotated_to = ? WHERE id = ?"
    ).bind(newRefreshId, row.id).run();

    noStore();
    return c.json({
      access_token,
      token_type: "Bearer",
      expires_in: 1209600,
      refresh_token: new_refresh_token,
      scope: row.scope,
    });
  }

  return tokenError("unsupported_grant_type", `grant_type '${grant_type ?? ""}' is not supported`);
});

oauthRoutes.post("/revoke", async (c) => {
  c.header("Cache-Control", "no-store");
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const rateLimit = await c.env.RATE_LIMITER.limit({ key: `revoke:${ip}` });
  if (!rateLimit.success) return c.json({ error: "rate_limit_exceeded" }, 429);

  const body = await c.req.parseBody() as Record<string, string>;
  const { token } = body;

  if (!token) return c.json({});

  const tokenHash = await sha256hex(token);

  if (token.startsWith("mcp_")) {
    await c.env.DB.prepare(
      "UPDATE personal_access_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL"
    ).bind(tokenHash).run();
  } else if (token.startsWith("mcr_")) {
    const row = await c.env.DB.prepare(
      "SELECT id, access_token_id FROM oauth_refresh_tokens WHERE token_hash = ?"
    ).bind(tokenHash).first<{ id: string; access_token_id: string }>();
    if (row) {
      await c.env.DB.batch([
        c.env.DB.prepare("UPDATE oauth_refresh_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").bind(row.id),
        c.env.DB.prepare("UPDATE personal_access_tokens SET revoked_at = datetime('now') WHERE id = ? AND revoked_at IS NULL").bind(row.access_token_id),
      ]);
    }
  }

  return c.json({});
});

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  "mcp.read": "Read health data",
  "mcp.write": "Read and write health data",
};

const VALID_SCOPES = new Set(["mcp.read", "mcp.write mcp.read", "mcp.read mcp.write"]);

type Variables = { user: DecodedToken };

const oauthApiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

oauthApiRoutes.use("*", async (c, next) => {
  if (c.req.header("x-api-key")) return c.json({ error: "Authentication required" }, 401);
  await next();
});
oauthApiRoutes.use("*", authMiddleware);

oauthApiRoutes.get("/authorize/info", async (c) => {
  const { client_id, scope, redirect_uri } = c.req.query();

  if (!client_id) {
    return c.json({ error: "invalid_client", error_description: "client_id is required" }, 400);
  }

  const client = await c.env.DB.prepare(
    "SELECT id, client_name FROM oauth_clients WHERE id = ?"
  ).bind(client_id).first<{ id: string; client_name: string }>();

  if (!client) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  if (!redirect_uri) {
    return c.json({ error: "invalid_request", error_description: "redirect_uri is required" }, 400);
  }

  let redirect_uri_host: string;
  try {
    redirect_uri_host = new URL(redirect_uri).hostname;
  } catch {
    return c.json({ error: "invalid_request", error_description: "Invalid redirect_uri" }, 400);
  }

  const scopeTokens = (scope ?? "mcp.read").split(/\s+/).filter(Boolean);
  const scope_descriptions = scopeTokens
    .filter((s) => s in SCOPE_DESCRIPTIONS)
    .map((s) => SCOPE_DESCRIPTIONS[s]);

  return c.json({
    client_id: client.id,
    client_name: client.client_name,
    scope_descriptions,
    redirect_uri,
    redirect_uri_host,
  });
});

oauthApiRoutes.post("/authorize/decision", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json<Record<string, unknown>>();
  } catch {
    return c.json({ error: "invalid_request", error_description: "Invalid JSON body" }, 400);
  }

  const {
    client_id,
    redirect_uri,
    scope,
    granted_scope,
    state,
    code_challenge,
    code_challenge_method,
    resource,
    decision,
  } = body as Record<string, string>;

  if (!client_id) {
    return c.json({ error: "invalid_client", error_description: "client_id is required" }, 400);
  }

  const client = await c.env.DB.prepare(
    "SELECT id, redirect_uris FROM oauth_clients WHERE id = ?"
  ).bind(client_id).first<{ id: string; redirect_uris: string }>();

  if (!client) {
    return c.json({ error: "invalid_client", error_description: "Unknown client_id" }, 400);
  }

  if (!redirect_uri || !isRedirectUriRegistered(client.redirect_uris, redirect_uri)) {
    return c.json({ error: "invalid_client", error_description: "redirect_uri not registered for this client" }, 400);
  }

  if (decision === "deny") {
    const url = new URL(redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (state) url.searchParams.set("state", state);
    return c.json({ redirect_to: url.toString() });
  }

  if (decision !== "approve") {
    return c.json({ error: "invalid_request", error_description: 'decision must be "approve" or "deny"' }, 400);
  }

  if (!state) {
    return c.json({ error: "invalid_request", error_description: "state is required" }, 400);
  }

  if (!code_challenge || !/^[A-Za-z0-9\-_]{43,128}$/.test(code_challenge)) {
    return c.json({ error: "invalid_request", error_description: "code_challenge must be 43-128 base64url characters" }, 400);
  }

  if (code_challenge_method !== "S256") {
    return c.json({ error: "invalid_request", error_description: "Only code_challenge_method=S256 is supported" }, 400);
  }

  const effectiveScope = scope ?? "mcp.read";
  if (!VALID_SCOPES.has(effectiveScope)) {
    return c.json({ error: "invalid_scope", error_description: `Scope not supported: ${effectiveScope}` }, 400);
  }

  const userGrantedScope = typeof granted_scope === "string" ? granted_scope : effectiveScope;
  if (!VALID_SCOPES.has(userGrantedScope)) {
    return c.json({ error: "invalid_scope", error_description: `granted_scope not supported: ${userGrantedScope}` }, 400);
  }
  if (userGrantedScope.includes("mcp.write") && !effectiveScope.includes("mcp.write")) {
    return c.json({ error: "invalid_scope", error_description: "granted_scope cannot exceed requested scope" }, 400);
  }

  const origin = getAppOrigin(c);
  if (resource !== `${origin}/mcp`) {
    return c.json({ error: "invalid_target", error_description: `resource must be ${origin}/mcp` }, 400);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const code_hash = await sha256hex(code);
  const userId = c.get("user").sub;

  await c.env.DB.prepare(
    `INSERT INTO oauth_auth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+60 seconds'))`
  ).bind(code_hash, client_id, userId, redirect_uri, code_challenge, code_challenge_method, userGrantedScope, resource).run();

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  return c.json({ redirect_to: url.toString() });
});

export { oauthWellKnown, oauthRoutes, oauthApiRoutes };
