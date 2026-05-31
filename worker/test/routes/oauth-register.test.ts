import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb } from "../helpers/setup-db";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

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

const VALID_BODY = {
  client_name: "Claude Desktop",
  redirect_uris: ["https://claude.ai/oauth/callback"],
};

describe("POST /oauth/register", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("happy path returns 201 with client_id", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    }, TEST_ENV);
    expect(res.status).toBe(201);
    const body = await res.json<Record<string, unknown>>();
    expect(typeof body.client_id).toBe("string");
    expect(body.client_name).toBe("Claude Desktop");
    expect(body.token_endpoint_auth_method).toBe("none");
    expect(Array.isArray(body.redirect_uris)).toBe(true);
  });

  it("missing client_name returns 400", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: ["https://example.com/cb"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("empty redirect_uris returns 400", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Test", redirect_uris: [] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rejects javascript: redirect URI", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Evil", redirect_uris: ["javascript:alert(1)"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("rejects http: redirect URI with non-localhost host", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Evil", redirect_uris: ["http://evil.com/cb"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("accepts http://localhost redirect URI", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Dev App", redirect_uris: ["http://localhost:3000/cb"] }),
    }, TEST_ENV);
    expect(res.status).toBe(201);
  });

  it("accepts custom scheme redirect URI (Claude Desktop IPC)", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Desktop App", redirect_uris: ["claude://oauth/callback"] }),
    }, TEST_ENV);
    expect(res.status).toBe(201);
  });

  it("rejects non-none token_endpoint_auth_method", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, token_endpoint_auth_method: "client_secret_post" }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rejects unsupported grant_type", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, grant_types: ["password"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rejects empty grant_types array", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, grant_types: [] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rejects data: redirect URI", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Evil", redirect_uris: ["data:text/html,<script>"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_redirect_uri");
  });

  it("rejects malformed JSON body", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rejects whitespace-only client_name", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "   ", redirect_uris: ["https://example.com/cb"] }),
    }, TEST_ENV);
    expect(res.status).toBe(400);
  });

  it("rate limit exceeded returns 429", async () => {
    const res = await app.request("/oauth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    }, RATE_LIMITED_ENV);
    expect(res.status).toBe(429);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("rate_limit_exceeded");
  });
});
