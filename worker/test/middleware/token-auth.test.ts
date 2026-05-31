import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient, seedPat, seedOAuthClient } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";


const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

// Raw token used across token-auth tests — deterministic so hash can be computed
const RAW_TOKEN = "mcp_" + "a".repeat(64);

const TEST_ENV = {
  ...env,
  JWT_SECRET,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};

const RATE_LIMITED_ENV = {
  ...env,
  JWT_SECRET,
  RATE_LIMITER: { limit: async () => ({ success: false }) },
};

describe("tokenAuthMiddleware", () => {
  let tokenHash: string;

  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    tokenHash = await sha256hex(RAW_TOKEN);
  });

  it("missing Authorization header returns 401 token_missing", async () => {
    const res = await app.request("/api/external/patients", {}, TEST_ENV);
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_missing");
  });

  it("token without mcp_ prefix returns 401 token_invalid", async () => {
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: "Bearer not_a_fhd_token_aaaaaaaaaa" } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_invalid");
  });

  it("fhd_ prefix token returns 401 token_invalid after prefix removal", async () => {
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer fhd_${"a".repeat(64)}` } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_invalid");
  });

  it("unknown token hash returns 401 token_invalid", async () => {
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer mcp_${"b".repeat(64)}` } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_invalid");
  });

  it("revoked token returns 401 token_revoked", async () => {
    await seedPat(env.DB, {
      token_hash: tokenHash,
      token_prefix: "mcp_aaaaaa",
      revoked_at: new Date().toISOString(),
    });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${RAW_TOKEN}` } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_revoked");
  });

  it("expired token returns 401 token_expired", async () => {
    await seedPat(env.DB, {
      token_hash: tokenHash,
      token_prefix: "mcp_aaaaaa",
      expires_at: new Date(Date.now() - 10_000).toISOString(),
    });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${RAW_TOKEN}` } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_expired");
  });

  it("valid token passes through and returns patient list", async () => {
    await seedPat(env.DB, { token_hash: tokenHash, token_prefix: "mcp_aaaaaa" });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${RAW_TOKEN}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ patients: unknown[] }>();
    expect(Array.isArray(body.patients)).toBe(true);
  });

  it("rate limit exceeded returns 429 rate_limit_exceeded", async () => {
    await seedPat(env.DB, { token_hash: tokenHash, token_prefix: "mcp_aaaaaa" });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${RAW_TOKEN}` } },
      RATE_LIMITED_ENV
    );
    expect(res.status).toBe(429);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("rate_limit_exceeded");
  });
});

describe("tokenAuthMiddleware — OAuth token support (mcp_ prefix)", () => {
  const MCP_TOKEN = "mcp_" + "c".repeat(64);
  let mcpTokenHash: string;

  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    mcpTokenHash = await sha256hex(MCP_TOKEN);
  });

  it("mcp_ prefix OAuth token passes auth and resolves user context", async () => {
    await seedPat(env.DB, {
      id: "mcp-pat-1",
      token_hash: mcpTokenHash,
      token_prefix: "mcp_cccccc",
      token_suffix: "ccc",
      issued_via: "oauth",
    });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });

  it("mcr_ prefix token returns 401 token_invalid", async () => {
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: "Bearer mcr_" + "d".repeat(64) } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_invalid");
  });

  it("401 response includes WWW-Authenticate header with resource_metadata", async () => {
    const res = await app.request(
      "/api/external/patients",
      {},  // no Authorization header → token_missing 401
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const wwwAuth = res.headers.get("WWW-Authenticate");
    expect(wwwAuth).toBeTruthy();
    expect(wwwAuth).toContain('realm="mcp"');
    expect(wwwAuth).toContain("resource_metadata=");
    expect(wwwAuth).toContain("/.well-known/oauth-protected-resource");
  });

  it("OAuth-issued token with client_id passes auth (200)", async () => {
    await seedOAuthClient(env.DB, { id: "client-1" });
    await seedPat(env.DB, {
      id: "mcp-pat-2",
      token_hash: mcpTokenHash,
      token_prefix: "mcp_cccccc",
      token_suffix: "ccc",
      issued_via: "oauth",
      client_id: "client-1",
    });
    const res = await app.request(
      "/api/external/patients",
      { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });
});
