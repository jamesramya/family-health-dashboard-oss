import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb, seedAdmin, seedPat } from "../helpers/setup-db";

describe("0019_oauth migration", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("oauth_clients table exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_clients'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("oauth_clients");
  });

  it("oauth_auth_codes table exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_auth_codes'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("oauth_auth_codes");
  });

  it("oauth_refresh_tokens table exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='oauth_refresh_tokens'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("oauth_refresh_tokens");
  });

  it("personal_access_tokens has client_id column", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(personal_access_tokens)"
    ).all<{ name: string }>();
    const cols = results.map((r) => r.name);
    expect(cols).toContain("client_id");
  });

  it("personal_access_tokens has issued_via column", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(personal_access_tokens)"
    ).all<{ name: string }>();
    const cols = results.map((r) => r.name);
    expect(cols).toContain("issued_via");
  });

  it("issued_via CHECK constraint rejects values outside ('pat','oauth')", async () => {
    await seedAdmin(env.DB);
    await expect(
      env.DB.prepare(
        `INSERT INTO personal_access_tokens
          (id, user_id, name, token_hash, token_prefix, token_suffix,
           pat_consent_acknowledged_at, issued_via)
         VALUES ('p-bad', 'admin-1', 'bad-token', 'hash-bad', 'fhd_aaaaaa', 'xxx',
                 datetime('now'), 'bad')`
      ).run()
    ).rejects.toThrow();
  });

  it("issued_via defaults to 'pat' and accepts 'oauth'", async () => {
    await seedAdmin(env.DB);
    await seedPat(env.DB, { id: "pat-1", user_id: "admin-1" });

    const row = await env.DB.prepare(
      "SELECT issued_via FROM personal_access_tokens WHERE id = 'pat-1'"
    ).first<{ issued_via: string }>();
    expect(row?.issued_via).toBe("pat");

    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
        (id, user_id, name, token_hash, token_prefix, token_suffix,
         pat_consent_acknowledged_at, issued_via)
       VALUES ('pat-oauth', 'admin-1', 'oauth-token', 'hash-oauth', 'fhd_bbbbbb', 'yyy',
               datetime('now'), 'oauth')`
    ).run();
    const row2 = await env.DB.prepare(
      "SELECT issued_via FROM personal_access_tokens WHERE id = 'pat-oauth'"
    ).first<{ issued_via: string }>();
    expect(row2?.issued_via).toBe("oauth");
  });

  it("oauth_auth_codes PK is code_hash — duplicate insert throws", async () => {
    await seedAdmin(env.DB);
    await env.DB.prepare(
      `INSERT INTO oauth_clients (id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope)
       VALUES ('client-1', 'Test Client', 'https://example.com/cb', 'authorization_code,refresh_token', 'code', 'none', 'mcp.read')`
    ).run();

    await env.DB.prepare(
      `INSERT INTO oauth_auth_codes
        (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
       VALUES ('hash-abc', 'client-1', 'admin-1', 'https://example.com/cb', 'challenge-1', 'mcp.read', 'https://api.example.com', datetime('now', '+60 seconds'))`
    ).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO oauth_auth_codes
          (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
         VALUES ('hash-abc', 'client-1', 'admin-1', 'https://example.com/cb', 'challenge-2', 'mcp.read', 'https://api.example.com', datetime('now', '+60 seconds'))`
      ).run()
    ).rejects.toThrow();
  });

  it("oauth_auth_codes code_challenge_method CHECK rejects non-S256 values", async () => {
    await seedAdmin(env.DB);
    await env.DB.prepare(
      `INSERT INTO oauth_clients (id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope)
       VALUES ('client-1', 'Test Client', 'https://example.com/cb', 'authorization_code,refresh_token', 'code', 'none', 'mcp.read')`
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO oauth_auth_codes
          (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES ('hash-plain', 'client-1', 'admin-1', 'https://example.com/cb', 'challenge-1', 'plain', 'mcp.read', 'https://api.example.com', datetime('now', '+60 seconds'))`
      ).run()
    ).rejects.toThrow();
  });

  it("oauth_refresh_tokens token_hash is UNIQUE — duplicate throws", async () => {
    await seedAdmin(env.DB);
    await seedPat(env.DB, { id: "pat-1", user_id: "admin-1" });

    await env.DB.prepare(
      `INSERT INTO oauth_clients (id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method, scope)
       VALUES ('client-1', 'Test Client', 'https://example.com/cb', 'authorization_code,refresh_token', 'code', 'none', 'mcp.read')`
    ).run();

    await env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
        (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES ('rt-1', 'rt-hash-1', 'pat-1', 'client-1', 'admin-1', 'mcp.read', 'https://api.example.com', datetime('now', '+30 days'))`
    ).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO oauth_refresh_tokens
          (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
         VALUES ('rt-2', 'rt-hash-1', 'pat-1', 'client-1', 'admin-1', 'mcp.read', 'https://api.example.com', datetime('now', '+30 days'))`
      ).run()
    ).rejects.toThrow();
  });
});
