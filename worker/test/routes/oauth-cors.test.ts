import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb } from "../helpers/setup-db";

const TEST_ENV = { ...env, JWT_SECRET: "test-jwt-secret-key-must-be-at-least-32-chars", RATE_LIMITER: { limit: async () => ({ success: true }) } };

describe("OAuth CORS headers", () => {
  beforeEach(async () => { await setupDb(env.DB); });

  it("OPTIONS /oauth/token returns CORS * without credentials", async () => {
    const res = await app.request("/oauth/token", {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    }, TEST_ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Headers")).toMatch(/content-type/i);
  });

  it("OPTIONS /oauth/register returns CORS * without credentials", async () => {
    const res = await app.request("/oauth/register", {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    }, TEST_ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(res.headers.get("Access-Control-Allow-Headers")).toMatch(/content-type/i);
  });

  it("OPTIONS /.well-known/oauth-authorization-server returns CORS * without credentials", async () => {
    const res = await app.request("/.well-known/oauth-authorization-server", {
      method: "OPTIONS",
      headers: {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "GET",
      },
    }, TEST_ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
