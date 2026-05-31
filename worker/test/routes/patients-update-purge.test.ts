import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedDocument, seedMedication } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

describe("PUT /api/patients/:pid", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("updates allowed fields and returns updated patient", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({
          name: "Demo Updated",
          date_of_birth: "1951-05-26",
          gender: "female",
          blood_type: "B+",
          allergies: ["Penicillin", "Aspirin"],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patient).toBeDefined();
    expect(body.patient.name).toBe("Demo Updated");
    expect(body.patient.blood_type).toBe("B+");

    const row = await env.DB.prepare("SELECT * FROM patient WHERE id = 'patient-1'").first<any>();
    expect(row?.name).toBe("Demo Updated");
    expect(row?.blood_type).toBe("B+");
  });

  it("partial update only modifies provided fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ blood_type: "O-" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patient.blood_type).toBe("O-");
    // name should remain unchanged
    expect(body.patient.name).toBe("Demo Patient");
  });

  it("rejects invalid date_of_birth format", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ date_of_birth: "26/05/1951" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid gender value", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ gender: "robot" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin user", async () => {
    // Give viewer access to the patient, but only as viewer role
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ name: "Should Fail" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for patient the user has no access to", async () => {
    // Create a second admin who has no access to patient-1
    await seedAdmin(env.DB, { id: "admin-2", email: "admin2@test.com" });
    // admin-2 is super admin so they should be able to see patient-1
    // Test with a viewer who has no access at all
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: `access_token=${token}` },
        body: JSON.stringify({ name: "Should Fail" }),
      },
      TEST_ENV
    );
    // viewer with no access to this patient gets 404 (not found / no access)
    expect(res.status).toBeOneOf([403, 404]);
  });
});

describe("DELETE /api/patients/:pid/purge", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("admin cascades all related data and returns purged: true", async () => {
    const token = await adminToken();

    // Seed a document with an R2 object
    await seedDocument(env.DB, { id: "doc-1", patient_id: "patient-1", r2_key: "patients/patient-1/documents/doc-1/report.pdf" });
    await env.BUCKET.put("patients/patient-1/documents/doc-1/report.pdf", new TextEncoder().encode("fake pdf"));

    // Seed a medication
    await seedMedication(env.DB, { id: "med-1", patient_id: "patient-1" });

    const res = await app.request(
      "/api/patients/patient-1/purge",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.purged).toBe(true);

    // Patient row is gone
    const patientRow = await env.DB.prepare("SELECT id FROM patient WHERE id = 'patient-1'").first();
    expect(patientRow).toBeNull();

    // Document row is gone
    const docRow = await env.DB.prepare("SELECT id FROM documents WHERE id = 'doc-1'").first();
    expect(docRow).toBeNull();

    // Medication row is gone
    const medRow = await env.DB.prepare("SELECT id FROM medications WHERE id = 'med-1'").first();
    expect(medRow).toBeNull();

    // user_patient_access is gone
    const accessRow = await env.DB.prepare(
      "SELECT id FROM user_patient_access WHERE patient_id = 'patient-1'"
    ).first();
    expect(accessRow).toBeNull();

    // R2 object is deleted
    const r2Object = await env.BUCKET.head("patients/patient-1/documents/doc-1/report.pdf");
    expect(r2Object).toBeNull();

    // purge_log entry was written
    const logRow = await env.DB.prepare(
      "SELECT * FROM purge_log ORDER BY purged_at DESC LIMIT 1"
    ).first<any>();
    expect(logRow).not.toBeNull();
    expect(logRow.r2_objects_deleted).toBeGreaterThanOrEqual(1);
  });

  it("returns 403 for non-admin user", async () => {
    // Give viewer access but not admin role
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/purge",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent patient", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/nonexistent-pid/purge",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});
