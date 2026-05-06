import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { createAccessToken } from "../../src/services/jwt";
import type { Bindings } from "../../src/types";
import type { DecodedToken } from "../../src/services/jwt";

type Variables = { user: DecodedToken };

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

function testApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use("/api/protected/*", authMiddleware);
  app.get("/api/protected/test", (c) => c.json({ userId: c.get("user").sub }));
  return app;
}

describe("authMiddleware", () => {
  it("rejects unauthenticated request", async () => {
    const res = await testApp().request("/api/protected/test", {}, { ...env, JWT_SECRET });
    expect(res.status).toBe(401);
  });

  it("accepts valid JWT cookie", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, JWT_SECRET);
    const res = await testApp().request(
      "/api/protected/test",
      { headers: { Cookie: `access_token=${token}` } },
      { ...env, JWT_SECRET }
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).userId).toBe("u1");
  });

  it("rejects expired JWT", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, JWT_SECRET, -1);
    const res = await testApp().request(
      "/api/protected/test",
      { headers: { Cookie: `access_token=${token}` } },
      { ...env, JWT_SECRET }
    );
    expect(res.status).toBe(401);
  });
});
