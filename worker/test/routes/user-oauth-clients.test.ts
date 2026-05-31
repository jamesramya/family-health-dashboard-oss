import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedOAuthClient, seedPat } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: true }) } };

async function adminCookie(id = "admin-1", email = "admin@test.com") {
  const token = await createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
  return `access_token=${token}`;
}

describe("GET /api/user/oauth-clients", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/user/oauth-clients", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns empty array when no clients", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: unknown[] }>();
    expect(body.clients).toEqual([]);
  });

  it("lists active clients with client_name", async () => {
    await seedOAuthClient(env.DB, { id: "client-1", client_name: "Claude Desktop" });
    await seedPat(env.DB, {
      id: "pat-oauth-1",
      user_id: "admin-1",
      issued_via: "oauth",
      client_id: "client-1",
      token_hash: "hash-oauth-1",
    });

    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: Record<string, unknown>[] }>();
    expect(body.clients.length).toBe(1);
    expect(body.clients[0].client_name).toBe("Claude Desktop");
  });

  it("does NOT return revoked clients", async () => {
    await seedOAuthClient(env.DB, { id: "client-2", client_name: "Revoked App" });
    await seedPat(env.DB, {
      id: "pat-oauth-2",
      user_id: "admin-1",
      issued_via: "oauth",
      client_id: "client-2",
      token_hash: "hash-oauth-2",
      revoked_at: new Date().toISOString(),
    });

    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: unknown[] }>();
    expect(body.clients).toEqual([]);
  });

  it("does NOT return clients for other users", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
    ).bind("other-user", "other@test.com", "fakehash", "admin", "Other User").run();

    await seedOAuthClient(env.DB, { id: "client-3", client_name: "Other User App" });
    await seedPat(env.DB, {
      id: "pat-oauth-3",
      user_id: "other-user",
      issued_via: "oauth",
      client_id: "client-3",
      token_hash: "hash-oauth-3",
    });

    const cookie = await adminCookie(); // logged in as admin-1
    const res = await app.request(
      "/api/user/oauth-clients",
      { headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: unknown[] }>();
    expect(body.clients).toEqual([]);
  });
});

describe("DELETE /api/user/oauth-clients/:client_id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(
      "/api/user/oauth-clients/client-x",
      { method: "DELETE" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("revokes PAT and returns revoked: true", async () => {
    await seedOAuthClient(env.DB, { id: "client-rev", client_name: "To Revoke" });
    await seedPat(env.DB, {
      id: "pat-rev-1",
      user_id: "admin-1",
      issued_via: "oauth",
      client_id: "client-rev",
      token_hash: "hash-rev-1",
    });

    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients/client-rev",
      { method: "DELETE", headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ revoked: boolean }>();
    expect(body.revoked).toBe(true);

    // PAT should be revoked
    const pat = await env.DB.prepare(
      "SELECT revoked_at FROM personal_access_tokens WHERE id = ?"
    ).bind("pat-rev-1").first<{ revoked_at: string | null }>();
    expect(pat?.revoked_at).not.toBeNull();
  });

  it("also revokes linked refresh tokens", async () => {
    await seedOAuthClient(env.DB, { id: "client-rt", client_name: "Refresh App" });
    await seedPat(env.DB, {
      id: "pat-rt-1",
      user_id: "admin-1",
      issued_via: "oauth",
      client_id: "client-rt",
      token_hash: "hash-rt-1",
    });
    // Insert a refresh token linked to this client and user
    await env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
        (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+30 days'))`
    ).bind("rt-1", "rthash-1", "pat-rt-1", "client-rt", "admin-1", "mcp.read", "https://example.com").run();

    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients/client-rt",
      { method: "DELETE", headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const rt = await env.DB.prepare(
      "SELECT revoked_at FROM oauth_refresh_tokens WHERE id = ?"
    ).bind("rt-1").first<{ revoked_at: string | null }>();
    expect(rt?.revoked_at).not.toBeNull();
  });

  it("returns 200 for unknown client (no leak)", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/oauth-clients/does-not-exist",
      { method: "DELETE", headers: { Cookie: cookie } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ revoked: boolean }>();
    expect(body.revoked).toBe(true);
  });
});
