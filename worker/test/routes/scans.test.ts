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

async function seedDocument(db: D1Database, id = "doc-1", patientId = "patient-1") {
  await db
    .prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES (?, ?, 'scan', 'Scan Report', '2024-01-15', ?, 'application/pdf', 12345, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    )
    .bind(id, patientId, `patients/${patientId}/documents/${id}/scan.pdf`)
    .run();
}

async function seedScan(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    patient_id: string;
    document_id: string;
    scan_type: string;
    body_area: string;
    findings_summary: string;
    scan_date: string;
    is_deleted: number;
  }>
) {
  const id = overrides?.id ?? "scan-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const document_id = overrides?.document_id ?? "doc-1";
  const scan_type = overrides?.scan_type ?? "xray";
  const body_area = overrides?.body_area ?? "chest";
  const findings_summary = overrides?.findings_summary ?? "No abnormalities detected";
  const scan_date = overrides?.scan_date ?? "2024-01-15";
  const is_deleted = overrides?.is_deleted ?? 0;

  await db
    .prepare(
      `INSERT INTO scan_findings
        (id, patient_id, document_id, scan_type, body_area, findings_summary, scan_date, is_deleted, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    )
    .bind(id, patient_id, document_id, scan_type, body_area, findings_summary, scan_date, is_deleted)
    .run();
  return id;
}

describe("GET /api/patients/:pid/scans", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("returns scans sorted by scan_date desc", async () => {
    await seedScan(env.DB, { id: "scan-1", scan_date: "2024-01-10" });
    await seedScan(env.DB, { id: "scan-2", scan_date: "2024-06-01" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scans.length).toBe(2);
    expect(body.scans[0].id).toBe("scan-2"); // Most recent first
    expect(body.scans[1].id).toBe("scan-1");
  });

  it("excludes is_deleted=1 scans", async () => {
    await seedScan(env.DB, { id: "scan-1", is_deleted: 0 });
    await seedScan(env.DB, { id: "scan-2", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scans.length).toBe(1);
    expect(body.scans[0].id).toBe("scan-1");
  });

  it("only returns scans for the specified patient", async () => {
    // Seed second patient
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other Patient", "1970-01-01", "male", "admin-1", "admin-1").run();
    await seedDocument(env.DB, "doc-2", "patient-2");
    await seedScan(env.DB, { id: "scan-1", patient_id: "patient-1" });
    await seedScan(env.DB, { id: "scan-p2", patient_id: "patient-2", document_id: "doc-2" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scans.length).toBe(1);
    expect(body.scans[0].patient_id).toBe("patient-1");
  });

  it("viewer can read scans", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/scans",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });

  it("filters by document_id when provided", async () => {
    await seedDocument(env.DB, "doc-2", "patient-1");
    await seedScan(env.DB, { id: "scan-1", document_id: "doc-1" });
    await seedScan(env.DB, { id: "scan-2", document_id: "doc-2" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans?document_id=doc-1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scans.length).toBe(1);
    expect(body.scans[0].id).toBe("scan-1");
  });

  it("returns all scans when document_id not provided", async () => {
    await seedDocument(env.DB, "doc-2", "patient-1");
    await seedScan(env.DB, { id: "scan-1", document_id: "doc-1" });
    await seedScan(env.DB, { id: "scan-2", document_id: "doc-2" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scans.length).toBe(2);
  });
});

describe("PUT /api/patients/:pid/scans/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
    await seedScan(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can update scan fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/scan-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ impression: "Clear lungs", ordering_doctor: "Dr. Smith" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.scan.impression).toBe("Clear lungs");
    expect(body.scan.ordering_doctor).toBe("Dr. Smith");
    expect(body.scan.updated_by).toBe("admin-1");
  });

  it("returns 404 for non-existent scan", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/nope",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ impression: "Clear" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot update scan", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/scan-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ impression: "Clear" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/patients/:pid/scans/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
    await seedScan(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can soft-delete a scan", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/scan-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare(
      "SELECT is_deleted, deleted_at, deleted_by FROM scan_findings WHERE id = ?"
    )
      .bind("scan-1")
      .first<any>();
    expect(row?.is_deleted).toBe(1);
    expect(row?.deleted_by).toBe("admin-1");
    expect(row?.deleted_at).toBeTruthy();
  });

  it("returns 404 for non-existent scan", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/nope",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot delete scan", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/scans/scan-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});
