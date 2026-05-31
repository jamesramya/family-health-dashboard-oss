import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { app } from "../src/index";

const TEST_ENV = { ...env, JWT_SECRET: "test-jwt-secret-key-must-be-at-least-32-chars" };

describe("GET /api/health", () => {
  it("returns ok with db status", async () => {
    const res = await app.request("/api/health", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });
});
