import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { authMiddleware } from "../../src/middleware/auth";
import { requireSuperAdmin } from "../../src/middleware/role";
import { createAccessToken } from "../../src/services/jwt";
import { setupDb, seedAdmin } from "../helpers/setup-db";
import type { Bindings } from "../../src/types";
import type { DecodedToken } from "../../src/services/jwt";

type Variables = { user: DecodedToken };

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

function testApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.use("/api/admin/*", authMiddleware);
  app.use("/api/admin/*", requireSuperAdmin);
  app.get("/api/admin/users", (c) => c.json({ ok: true }));
  return app;
}

describe("requireSuperAdmin", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("returns 401 without auth token", async () => {
    const res = await testApp().request("/api/admin/users", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-super-admin user", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();
    const token = await createAccessToken({ sub: "admin-2", role: "admin", email: "admin2@test.com" }, JWT_SECRET);
    const res = await testApp().request(
      "/api/admin/users",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("passes through for a super admin", async () => {
    const token = await createAccessToken({ sub: "admin-1", role: "admin", email: "admin@test.com" }, JWT_SECRET);
    const res = await testApp().request(
      "/api/admin/users",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });
});
