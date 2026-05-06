import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };
// miniflare bindings include ANTHROPIC_API_KEY:"test-key"; clear all provider keys for accurate capability checks
const CLEAN_ENV = { ...TEST_ENV, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GOOGLE_API_KEY: "", DEEPGRAM_API_KEY: "" };

async function adminToken() {
  return createAccessToken({ sub: "admin-1", role: "admin", email: "admin@test.com" }, JWT_SECRET);
}

describe("GET /api/ai/capabilities", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("returns all false when no provider keys configured", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/capabilities",
      { headers: { Cookie: `access_token=${token}` } },
      CLEAN_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      google: boolean; openai: boolean; anthropic: boolean; deepgram: boolean;
    }>();
    expect(body.google).toBe(false);
    expect(body.openai).toBe(false);
    expect(body.anthropic).toBe(false);
    expect(body.deepgram).toBe(false);
  });

  it("returns true for keys present in env", async () => {
    const token = await adminToken();
    const envWithKeys = {
      ...CLEAN_ENV,
      GOOGLE_API_KEY: "gk-test",
      DEEPGRAM_API_KEY: "dg-test",
    };
    const res = await app.request(
      "/api/ai/capabilities",
      { headers: { Cookie: `access_token=${token}` } },
      envWithKeys
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      google: boolean; openai: boolean; anthropic: boolean; deepgram: boolean;
    }>();
    expect(body.google).toBe(true);
    expect(body.deepgram).toBe(true);
    expect(body.openai).toBe(false);
    expect(body.anthropic).toBe(false);
  });

  it("does not expose key values — only booleans", async () => {
    const token = await adminToken();
    const envWithKeys = { ...TEST_ENV, GOOGLE_API_KEY: "secret-key-value" };
    const res = await app.request(
      "/api/ai/capabilities",
      { headers: { Cookie: `access_token=${token}` } },
      envWithKeys
    );
    const text = await res.text();
    expect(text).not.toContain("secret-key-value");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/ai/capabilities", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});
