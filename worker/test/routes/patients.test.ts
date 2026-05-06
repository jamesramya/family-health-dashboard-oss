import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

describe("GET /api/patients", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("returns empty list when no patients exist", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patients).toEqual([]);
  });

  it("super admin sees all patients including those without explicit access", async () => {
    // Create a second admin and seed a patient under that admin
    await seedAdmin(env.DB, { id: "admin-2", email: "admin2@test.com" });
    await seedPatient(env.DB, "admin-1");
    // Create a second patient with no access for admin-1
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other Patient", "1960-01-01", "male", "admin-2", "admin-2").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patients.length).toBe(2);
  });

  it("non-super-admin only sees patients they have access to", async () => {
    await seedAdmin(env.DB, { id: "admin-2", email: "admin2@test.com" });
    await seedPatient(env.DB, "admin-1");
    // Create a second patient with no access for viewer-1
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other Patient", "1960-01-01", "male", "admin-2", "admin-2").run();

    // Grant viewer-1 access only to patient-1
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patients.length).toBe(1);
    expect(body.patients[0].id).toBe("patient-1");
  });

  it("unauthenticated returns 401", async () => {
    const res = await app.request("/api/patients", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/patients", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin creates patient + auto-grants admin access", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({
          name: "Demo Patient",
          date_of_birth: "1951-05-26",
          gender: "female",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.patient.name).toBe("Demo Patient");
    expect(body.patient.id).toBeTruthy();

    // Check DB: patient row exists
    const pRow = await env.DB.prepare("SELECT * FROM patient WHERE id = ?")
      .bind(body.patient.id).first<any>();
    expect(pRow).not.toBeNull();
    expect(pRow.name).toBe("Demo Patient");

    // Check DB: user_patient_access row was created for the creator
    const aRow = await env.DB.prepare(
      "SELECT * FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind("admin-1", body.patient.id).first<any>();
    expect(aRow).not.toBeNull();
    expect(aRow.role).toBe("admin");
  });

  it("non-super-admin returns 403", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({
          name: "Test Patient",
          date_of_birth: "1980-01-01",
          gender: "male",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("missing required fields returns 400", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ name: "Partial" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/patients/:pid/access", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("super admin grants access to another user", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/access",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ user_id: "viewer-1", role: "viewer" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);

    const row = await env.DB.prepare(
      "SELECT * FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind("viewer-1", "patient-1").first<any>();
    expect(row).not.toBeNull();
    expect(row.role).toBe("viewer");
  });

  it("patient-admin can grant access", async () => {
    // Give viewer-1 admin access to patient-1
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "admin", "admin-1").run();

    // Create another user to grant access to
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
    ).bind("user-2", "user2@test.com", "fakehash", "viewer", "User Two").run();

    const token = await createAccessToken({ sub: "viewer-1", role: "viewer", email: "viewer@test.com" }, JWT_SECRET);
    const res = await app.request(
      "/api/patients/patient-1/access",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ user_id: "user-2", role: "viewer" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
  });

  it("non-admin viewer cannot grant access", async () => {
    // Give viewer-1 viewer-only access to patient-1
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();

    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
    ).bind("user-2", "user2@test.com", "fakehash", "viewer", "User Two").run();

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/access",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ user_id: "user-2", role: "viewer" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("grants access fails when target user does not exist", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/access",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ user_id: "nonexistent-user", role: "viewer" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/patients/:pid/access/:uid", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    // Give viewer-1 access to patient-1
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
  });

  it("super admin can revoke access", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/access/viewer-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const row = await env.DB.prepare(
      "SELECT * FROM user_patient_access WHERE user_id = ? AND patient_id = ?"
    ).bind("viewer-1", "patient-1").first<any>();
    expect(row).toBeNull();
  });

  it("cannot revoke super admin's own access", async () => {
    const token = await adminToken();
    // Try to revoke admin-1's access from patient-1 (admin-1 is a super admin)
    const res = await app.request(
      "/api/patients/patient-1/access/admin-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when access record does not exist", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/access/nonexistent-user",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});
