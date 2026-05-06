import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { patientAccessMiddleware } from "../../src/middleware/patient-access";
import { createAccessToken } from "../../src/services/jwt";
import { setupDb, seedAdmin, seedViewer, seedPatient } from "../helpers/setup-db";
import type { Bindings } from "../../src/types";
import type { DecodedToken } from "../../src/services/jwt";

type Variables = { user: DecodedToken; patientId: string; patientRole: string };

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
  app.get("/api/patients/:pid/data", patientAccessMiddleware, (c) =>
    c.json({ patientId: c.get("patientId"), patientRole: c.get("patientRole") })
  );
  return app;
}

describe("patientAccessMiddleware", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("super admin accesses any patient with admin role", async () => {
    const token = await createAccessToken({ sub: "admin-1", role: "admin", email: "admin@test.com" }, JWT_SECRET);
    const res = await testApp().request("/api/patients/patient-1/data", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.patientRole).toBe("admin");
  });

  it("user with granted access gets their role", async () => {
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES ('a2', 'viewer-1', 'patient-1', 'viewer', 'admin-1')"
    ).run();
    const token = await createAccessToken({ sub: "viewer-1", role: "viewer", email: "viewer@test.com" }, JWT_SECRET);
    const res = await testApp().request("/api/patients/patient-1/data", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.patientRole).toBe("viewer");
  });

  it("user without access gets 403", async () => {
    const token = await createAccessToken({ sub: "viewer-1", role: "viewer", email: "viewer@test.com" }, JWT_SECRET);
    const res = await testApp().request("/api/patients/patient-1/data", {
      headers: { Authorization: `Bearer ${token}` },
    }, { ...env, JWT_SECRET });
    expect(res.status).toBe(403);
  });
});
