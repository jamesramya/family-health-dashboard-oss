import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

describe("POST /api/admin/users — patient access grant", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("grants access to all existing patients for a new viewer", async () => {
    await seedPatient(env.DB);
    // Second patient
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other Patient", "1980-01-01", "male", "admin-1", "admin-1").run();
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("access-p2", "admin-1", "patient-2", "admin", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "new@test.com", display_name: "New Viewer", role: "viewer" }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const { user } = await res.json<any>();

    const rows = await env.DB.prepare(
      "SELECT patient_id, role FROM user_patient_access WHERE user_id = ? ORDER BY patient_id"
    ).bind(user.id).all<{ patient_id: string; role: string }>();

    expect(rows.results).toHaveLength(2);
    expect(rows.results.map((r) => r.patient_id).sort()).toEqual(["patient-1", "patient-2"]);
    expect(rows.results.every((r) => r.role === "viewer")).toBe(true);
  });

  it("new user with no existing patients gets no access rows", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "no-patients@test.com", display_name: "No Patients User", role: "viewer" }),
      },
      TEST_ENV
    );

    expect(res.status).toBe(201);
    const { user } = await res.json<any>();

    const rows = await env.DB.prepare(
      "SELECT id FROM user_patient_access WHERE user_id = ?"
    ).bind(user.id).all();

    expect(rows.results).toHaveLength(0);
  });
});
