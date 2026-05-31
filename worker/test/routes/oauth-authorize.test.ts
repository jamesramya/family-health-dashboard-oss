import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedOAuthClient } from "../helpers/setup-db";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET, RATE_LIMITER: { limit: async () => ({ success: true }) } };

const VALID_CODE_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"; // 43 chars, base64url

function buildAuthorizeUrl(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return `/oauth/authorize?${qs}`;
}

const BASE_PARAMS = {
  response_type: "code",
  client_id: "client-1",
  redirect_uri: "https://example.com/cb",
  scope: "mcp.read",
  state: "random-state-abc",
  code_challenge: VALID_CODE_CHALLENGE,
  code_challenge_method: "S256",
  resource: "http://localhost/mcp",
};

describe("GET /oauth/authorize", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedOAuthClient(env.DB, {
      id: "client-1",
      redirect_uris: JSON.stringify(["https://example.com/cb"]),
    });
  });

  it("happy path redirects to /oauth/authorize (SPA hop)", async () => {
    const res = await app.request(buildAuthorizeUrl(BASE_PARAMS), {}, TEST_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("Location");
    expect(location).toMatch(/^\/oauth\/authorize\?/);
    expect(location).toContain("response_type=code");
  });

  it("missing client_id returns 400 JSON", async () => {
    const { client_id: _, ...params } = BASE_PARAMS;
    const res = await app.request(buildAuthorizeUrl(params), {}, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_client");
  });

  it("unknown client_id returns 400 JSON", async () => {
    const res = await app.request(buildAuthorizeUrl({ ...BASE_PARAMS, client_id: "unknown" }), {}, TEST_ENV);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_client");
  });

  it("unregistered redirect_uri returns 400 JSON", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, redirect_uri: "https://evil.com/cb" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid_client");
  });

  it("wrong response_type redirects with error", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, response_type: "token" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=unsupported_response_type");
    expect(location).toContain("state=");
  });

  it("missing state redirects with error and no state param", async () => {
    const { state: _, ...params } = BASE_PARAMS;
    const res = await app.request(buildAuthorizeUrl(params), {}, TEST_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_request");
    expect(location).not.toContain("state=");
  });

  it("missing code_challenge redirects with error", async () => {
    const { code_challenge: _, ...params } = BASE_PARAMS;
    const res = await app.request(buildAuthorizeUrl(params), {}, TEST_ENV);
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_request");
  });

  it("malformed code_challenge (too short) redirects with error", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, code_challenge: "short" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_request");
  });

  it("invalid code_challenge_method redirects with error", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, code_challenge_method: "plain" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_request");
  });

  it("unsupported scope redirects with error", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, scope: "openid" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_scope");
  });

  it("wrong resource redirects with error", async () => {
    const res = await app.request(
      buildAuthorizeUrl({ ...BASE_PARAMS, resource: "https://other-server.com/mcp" }),
      {}, TEST_ENV
    );
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("error=invalid_target");
  });
});
