import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedOAuthClient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: true }) } };

const VALID_CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function adminCookie(id = "admin-1", email = "admin@test.com") {
  const token = await createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
  return `access_token=${token}`;
}

const BASE_DECISION_BODY = {
  client_id: "client-1",
  redirect_uri: "https://example.com/cb",
  scope: "mcp.read",
  state: "random-state-xyz",
  code_challenge: VALID_CODE_CHALLENGE,
  code_challenge_method: "S256",
  resource: "http://localhost/mcp",
  decision: "approve",
};

describe("POST /api/oauth/authorize/decision", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedOAuthClient(env.DB, {
      id: "client-1",
      redirect_uris: JSON.stringify(["https://example.com/cb"]),
    });
  });

  it("returns 401 without cookie auth", async () => {
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(BASE_DECISION_BODY),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("deny decision returns 200 with error=access_denied redirect", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, decision: "deny" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ redirect_to: string }>();
    expect(body.redirect_to).toContain("error=access_denied");
    expect(body.redirect_to).toContain("state=random-state-xyz");
    expect(body.redirect_to).toMatch(/^https:\/\/example\.com\/cb\?/);
  });

  it("approve decision returns 200 with ?code= and ?state= in redirect", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(BASE_DECISION_BODY),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ redirect_to: string }>();
    expect(body.redirect_to).toContain("code=");
    expect(body.redirect_to).toContain("state=random-state-xyz");
    expect(body.redirect_to).toMatch(/^https:\/\/example\.com\/cb\?/);
  });

  it("approve inserts a row into oauth_auth_codes", async () => {
    const cookie = await adminCookie();
    await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify(BASE_DECISION_BODY),
      },
      TEST_ENV
    );
    const row = await env.DB.prepare(
      "SELECT * FROM oauth_auth_codes WHERE client_id = ? AND user_id = ?"
    ).bind("client-1", "admin-1").first<{
      client_id: string;
      user_id: string;
      scope: string;
      resource: string;
      expires_at: string;
    }>();
    expect(row).not.toBeNull();
    expect(row!.client_id).toBe("client-1");
    expect(row!.user_id).toBe("admin-1");
    expect(row!.scope).toBe("mcp.read");
    expect(row!.resource).toBe("http://localhost/mcp");
    const expiresAt = new Date(row!.expires_at + "Z");
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns 400 when client_id is unknown", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, client_id: "unknown-client" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_client");
  });

  it("returns 400 when redirect_uri is not registered", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, redirect_uri: "https://evil.com/cb" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_client");
  });

  it("returns 400 when code_challenge_method is not S256", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, code_challenge_method: "plain" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });

  it("invalid decision value returns 400", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, decision: "maybe" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_request");
  });

  it("x-api-key header returns 401 (bypasses cookie auth)", async () => {
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { "x-api-key": "any-value", "Content-Type": "application/json" },
        body: JSON.stringify(BASE_DECISION_BODY),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("deny with no state omits state from redirect", async () => {
    const cookie = await adminCookie();
    const { state: _, ...bodyWithoutState } = BASE_DECISION_BODY;
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...bodyWithoutState, decision: "deny" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ redirect_to: string }>();
    expect(body.redirect_to).toContain("error=access_denied");
    expect(body.redirect_to).not.toContain("state=");
  });

  it("returns 400 when scope is unsupported", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...BASE_DECISION_BODY, scope: "openid" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_scope");
  });

  it("granted_scope=mcp.read with scope=mcp.read mcp.write stores mcp.read in auth code", async () => {
    const cookie = await adminCookie();
    await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE_DECISION_BODY,
          scope: "mcp.read mcp.write",
          granted_scope: "mcp.read",
        }),
      },
      TEST_ENV
    );
    const row = await env.DB.prepare(
      "SELECT scope FROM oauth_auth_codes WHERE client_id = ? AND user_id = ?"
    ).bind("client-1", "admin-1").first<{ scope: string }>();
    expect(row).not.toBeNull();
    expect(row!.scope).toBe("mcp.read");
  });

  it("granted_scope wider than requested scope returns 400 invalid_scope", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE_DECISION_BODY,
          scope: "mcp.read",
          granted_scope: "mcp.read mcp.write",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_scope");
  });

  it("granted_scope with unsupported value returns 400 invalid_scope", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/decision",
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...BASE_DECISION_BODY,
          scope: "mcp.read mcp.write",
          granted_scope: "openid",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_scope");
  });
});

describe("GET /api/oauth/authorize/info", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedOAuthClient(env.DB, {
      id: "client-1",
      client_name: "Claude Desktop",
      redirect_uris: JSON.stringify(["https://claude.ai/callback"]),
      scope: "mcp.read",
    });
  });

  it("returns 401 without cookie auth", async () => {
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=client-1&scope=mcp.read&redirect_uri=https://claude.ai/callback",
      {},
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("returns client_name, scope_descriptions, and redirect_uri_host", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=client-1&scope=mcp.read&redirect_uri=https://claude.ai/callback",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      client_name: string;
      scope_descriptions: string[];
      redirect_uri_host: string;
    }>();
    expect(body.client_name).toBe("Claude Desktop");
    expect(body.scope_descriptions).toEqual(["Read health data"]);
    expect(body.redirect_uri_host).toBe("claude.ai");
  });

  it("mcp.write scope returns correct description", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=client-1&scope=mcp.write&redirect_uri=https://claude.ai/callback",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ scope_descriptions: string[] }>();
    expect(body.scope_descriptions).toEqual(["Read and write health data"]);
  });

  it("mcp.read mcp.write scope returns both descriptions", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=client-1&scope=mcp.read+mcp.write&redirect_uri=https://claude.ai/callback",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ scope_descriptions: string[] }>();
    expect(body.scope_descriptions).toEqual(["Read health data", "Read and write health data"]);
  });

  it("missing client_id returns 400", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?scope=mcp.read&redirect_uri=https://claude.ai/callback",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("unknown client_id returns 400", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=unknown&scope=mcp.read&redirect_uri=https://claude.ai/callback",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("missing redirect_uri returns 400", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/oauth/authorize/info?client_id=client-1&scope=mcp.read",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns client_id and redirect_uri in addition to existing fields", async () => {
    const cookie = await adminCookie();
    const qs = new URLSearchParams({
      client_id: "client-1",
      scope: "mcp.read",
      redirect_uri: "https://claude.ai/callback",
    });
    const res = await app.request(
      `/api/oauth/authorize/info?${qs}`,
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.client_name).toBe("Claude Desktop");
    expect(body.client_id).toBe("client-1");
    expect(body.redirect_uri).toBe("https://claude.ai/callback");
    expect(body.redirect_uri_host).toBe("claude.ai");
    expect(Array.isArray(body.scope_descriptions)).toBe(true);
  });
});
