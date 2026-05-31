import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedOAuthClient } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: true }) } };
const RATE_LIMITED_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: false }) } };

// Pre-computed PKCE pair using RFC 7636 Appendix B test vector:
const CODE_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const REDIRECT_URI = "https://example.com/cb";
const RESOURCE = "http://localhost/mcp";
const CLIENT_ID = "client-1";
const USER_ID = "admin-1";
const SCOPE = "mcp.read";

function tokenBody(overrides: Record<string, string> = {}): string {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: "testcode123",
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: CODE_VERIFIER,
    resource: RESOURCE,
    ...overrides,
  });
  return params.toString();
}

async function postToken(body: string, testEnv = TEST_ENV) {
  return app.request(
    "/oauth/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    testEnv
  );
}

describe("POST /oauth/token", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedOAuthClient(env.DB, {
      id: CLIENT_ID,
      redirect_uris: JSON.stringify([REDIRECT_URI]),
      scope: SCOPE,
    });
  });

  describe("authorization_code grant", () => {
    it("happy path: returns 200 with access_token, refresh_token, token_type, expires_in, scope", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(tokenBody());
      expect(res.status).toBe(200);

      const body = await res.json<{
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
        scope: string;
      }>();
      expect(body.access_token).toMatch(/^mcp_/);
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(1209600);
      expect(body.refresh_token).toMatch(/^mcr_/);
      expect(body.scope).toBe(SCOPE);
    });

    it("code reuse returns invalid_grant", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      // First use
      const res1 = await postToken(tokenBody());
      expect(res1.status).toBe(200);

      // Second use of the same code
      const res2 = await postToken(tokenBody());
      expect(res2.status).toBe(400);
      const body = await res2.json<{ error: string }>();
      expect(body.error).toBe("invalid_grant");
    });

    it("PKCE mismatch returns invalid_grant", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(
        tokenBody({ code_verifier: "wrong-verifier-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })
      );
      expect(res.status).toBe(400);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("invalid_grant");
    });

    it("expired auth code returns invalid_grant", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '-1 minute'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(tokenBody());
      expect(res.status).toBe(400);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("invalid_grant");
    });

    it("wrong redirect_uri returns invalid_grant", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(
        tokenBody({ redirect_uri: "https://evil.com/cb" })
      );
      expect(res.status).toBe(400);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("invalid_grant");
    });

    it("Cache-Control: no-store is set on success response", async () => {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(tokenBody());
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("rate limit returns 429 with error=rate_limit_exceeded", async () => {
      const res = await postToken(tokenBody(), RATE_LIMITED_ENV);
      expect(res.status).toBe(429);
      const body = await res.json<{ error: string }>();
      expect(body.error).toBe("rate_limit_exceeded");
    });
  });

  describe("refresh_token grant", () => {
    async function doCodeGrant(): Promise<{
      access_token: string;
      refresh_token: string;
    }> {
      await env.DB.prepare(
        `INSERT INTO oauth_auth_codes
           (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
         VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, datetime('now', '+60 seconds'))`
      )
        .bind(
          await sha256hex("testcode123"),
          CLIENT_ID,
          USER_ID,
          REDIRECT_URI,
          CODE_CHALLENGE,
          SCOPE,
          RESOURCE
        )
        .run();

      const res = await postToken(tokenBody());
      expect(res.status).toBe(200);
      return res.json();
    }

    it("refresh grant happy path: returns new access_token and refresh_token", async () => {
      const { refresh_token } = await doCodeGrant();

      const res = await postToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id: CLIENT_ID,
        }).toString()
      );
      expect(res.status).toBe(200);

      const body = await res.json<{
        access_token: string;
        token_type: string;
        expires_in: number;
        refresh_token: string;
        scope: string;
      }>();
      expect(body.access_token).toMatch(/^mcp_/);
      expect(body.token_type).toBe("Bearer");
      expect(body.expires_in).toBe(1209600);
      expect(body.refresh_token).toMatch(/^mcr_/);
      expect(body.refresh_token).not.toBe(refresh_token);
      expect(body.scope).toBe(SCOPE);
    });

    it("refresh theft detection: cascade-revokes and returns invalid_grant", async () => {
      const { refresh_token } = await doCodeGrant();

      // First refresh — rotates the refresh token
      const res1 = await postToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id: CLIENT_ID,
        }).toString()
      );
      expect(res1.status).toBe(200);

      // Present the already-rotated refresh token (theft scenario)
      const res2 = await postToken(
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token,
          client_id: CLIENT_ID,
        }).toString()
      );
      expect(res2.status).toBe(400);
      const body = await res2.json<{ error: string }>();
      expect(body.error).toBe("invalid_grant");

      // Verify cascade: oauth-issued PATs for this client/user are revoked
      const pats = await env.DB.prepare(
        `SELECT revoked_at FROM personal_access_tokens
         WHERE client_id = ? AND user_id = ? AND issued_via = 'oauth'`
      )
        .bind(CLIENT_ID, USER_ID)
        .all<{ revoked_at: string | null }>();
      expect(pats.results.length).toBeGreaterThan(0);
      expect(pats.results.every((r) => r.revoked_at !== null)).toBe(true);
    });
  });
});
