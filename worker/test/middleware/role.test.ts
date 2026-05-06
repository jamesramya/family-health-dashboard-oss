import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireRole } from "../../src/middleware/role";
import { createAccessToken } from "../../src/services/jwt";
import type { Bindings } from "../../src/types";
import type { DecodedToken } from "../../src/services/jwt";

type Variables = { user: DecodedToken };

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

function testApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use("*", async (c, next) => {
    const token = c.req.header("Authorization")?.replace("Bearer ", "");
    if (token) {
      const { verifyAccessToken } = await import("../../src/services/jwt");
      c.set("user", await verifyAccessToken(token, c.env.JWT_SECRET));
    }
    await next();
  });
  app.get("/admin-only", requireRole("admin"), (c) => c.json({ ok: true }));
  app.get("/any-role", requireRole("admin", "viewer"), (c) => c.json({ ok: true }));
  return app;
}

describe("requireRole", () => {
  it("allows admin to access admin-only route", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, JWT_SECRET);
    const res = await testApp().request("/admin-only", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(200);
  });

  it("blocks viewer from admin-only route with 403", async () => {
    const token = await createAccessToken({ sub: "u2", role: "viewer", email: "v@b.com" }, JWT_SECRET);
    const res = await testApp().request("/admin-only", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(403);
  });

  it("allows viewer on multi-role route", async () => {
    const token = await createAccessToken({ sub: "u2", role: "viewer", email: "v@b.com" }, JWT_SECRET);
    const res = await testApp().request("/any-role", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(200);
  });
});
