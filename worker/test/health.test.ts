import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { app } from "../src/index";

describe("GET /api/health", () => {
  it("returns ok with db status", async () => {
    const res = await app.request("/api/health", {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ status: string }>();
    expect(body.status).toBe("ok");
  });
});
