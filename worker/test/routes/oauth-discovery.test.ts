import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb } from "../helpers/setup-db";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

const TEST_ENV = { ...env, JWT_SECRET };

describe("OAuth discovery endpoints", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  describe("GET /.well-known/oauth-authorization-server", () => {
    it("returns 200 with correct metadata shape", async () => {
      const res = await app.request("/.well-known/oauth-authorization-server", {}, TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.issuer).toMatch(/^https?:\/\//);
      expect(body.authorization_endpoint).toContain("/oauth/authorize");
      expect(body.token_endpoint).toContain("/oauth/token");
      expect(body.registration_endpoint).toContain("/oauth/register");
      expect(body.revocation_endpoint).toContain("/oauth/revoke");
      expect(body.response_types_supported).toEqual(["code"]);
      expect(body.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
      expect(body.token_endpoint_auth_methods_supported).toEqual(["none"]);
      expect(Array.isArray(body.scopes_supported)).toBe(true);
      expect((body.scopes_supported as string[])).toContain("mcp.read");
    });

    it("returns CORS header allowing all origins without credentials", async () => {
      const res = await app.request("/.well-known/oauth-authorization-server", {
        headers: { Origin: "https://claude.ai" },
      }, TEST_ENV);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    it("OPTIONS preflight returns correct CORS headers", async () => {
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

  it("does not break the existing /.well-known/mcp endpoint", async () => {
    const res = await app.request("/.well-known/mcp", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    const auth = body.auth as Record<string, unknown>;
    expect(auth.type).toBe("oauth2");
    expect(typeof auth.authorization_url).toBe("string");
    expect((auth.authorization_url as string)).toContain("/oauth/authorize");
    expect(typeof auth.token_url).toBe("string");
    expect((auth.token_url as string)).toContain("/oauth/token");
    expect(typeof auth.registration_url).toBe("string");
    expect((auth.registration_url as string)).toContain("/oauth/register");
    expect(Array.isArray(auth.scopes)).toBe(true);
  });

  describe("GET /.well-known/oauth-protected-resource", () => {
    it("returns 200 with correct metadata shape", async () => {
      const res = await app.request("/.well-known/oauth-protected-resource", {}, TEST_ENV);
      expect(res.status).toBe(200);
      const body = await res.json<Record<string, unknown>>();
      expect(body.resource).toContain("/mcp");
      expect(Array.isArray(body.authorization_servers)).toBe(true);
      expect((body.authorization_servers as string[]).length).toBeGreaterThan(0);
      expect(Array.isArray(body.scopes_supported)).toBe(true);
      expect(body.bearer_methods_supported).toEqual(["header"]);
    });

    it("returns CORS header allowing all origins without credentials", async () => {
      const res = await app.request("/.well-known/oauth-protected-resource", {
        headers: { Origin: "https://claude.ai" },
      }, TEST_ENV);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });

    it("OPTIONS preflight returns correct CORS headers", async () => {
      const res = await app.request("/.well-known/oauth-protected-resource", {
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
});
