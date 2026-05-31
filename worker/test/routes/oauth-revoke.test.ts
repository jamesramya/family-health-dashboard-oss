import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPat, seedOAuthClient } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: true }) } };
const RATE_LIMITED_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: false }) } };

describe("POST /oauth/revoke", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  async function post(token: string) {
    return app.request("/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    }, TEST_ENV);
  }

  it("returns 200 for unknown token (no leak)", async () => {
    const res = await post("mcp_" + "x".repeat(64));
    expect(res.status).toBe(200);
  });

  it("revokes mcp_ token", async () => {
    const rawToken = "mcp_" + "a".repeat(64);
    const tokenHash = await sha256hex(rawToken);
    await seedPat(env.DB, { token_hash: tokenHash, token_prefix: "mcp_aaaaaa", token_suffix: "aaaa", issued_via: "oauth" });
    await post(rawToken);
    const row = await env.DB.prepare(
      "SELECT revoked_at FROM personal_access_tokens WHERE token_hash = ?"
    ).bind(tokenHash).first<{ revoked_at: string | null }>();
    expect(row?.revoked_at).not.toBeNull();
  });

  it("revokes mcr_ token and linked PAT", async () => {
    const accessRaw = "mcp_" + "b".repeat(64);
    const accessHash = await sha256hex(accessRaw);
    await seedPat(env.DB, { id: "pat-rtk", token_hash: accessHash, token_prefix: "mcp_bbbbbb", token_suffix: "bbbb", issued_via: "oauth" });

    await seedOAuthClient(env.DB, { id: "c1" });
    const refreshRaw = "mcr_" + "c".repeat(64);
    const refreshHash = await sha256hex(refreshRaw);
    await env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES ('rt-1', ?, 'pat-rtk', 'c1', 'admin-1', 'mcp.read', 'http://localhost/mcp', datetime('now', '+30 days'))`
    ).bind(refreshHash).run();

    await post(refreshRaw);

    const rt = await env.DB.prepare(
      "SELECT revoked_at FROM oauth_refresh_tokens WHERE id = 'rt-1'"
    ).first<{ revoked_at: string | null }>();
    expect(rt?.revoked_at).not.toBeNull();

    const pat = await env.DB.prepare(
      "SELECT revoked_at FROM personal_access_tokens WHERE id = 'pat-rtk'"
    ).first<{ revoked_at: string | null }>();
    expect(pat?.revoked_at).not.toBeNull();
  });

  it("returns 200 for completely unknown token", async () => {
    const res = await post("unknown_prefix_abc123");
    expect(res.status).toBe(200);
  });

  it("sets Cache-Control: no-store", async () => {
    const res = await post("mcp_" + "z".repeat(64));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 200 when token field is missing", async () => {
    const res = await app.request("/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
    }, TEST_ENV);
    expect(res.status).toBe(200);
  });

  it("rate limit exceeded returns 429", async () => {
    const res = await app.request("/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "mcp_" + "x".repeat(64) }).toString(),
    }, RATE_LIMITED_ENV);
    expect(res.status).toBe(429);
  });
});
