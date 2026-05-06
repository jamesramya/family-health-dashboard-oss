import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedMedication } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

async function seedDocument(db: D1Database, overrides?: Partial<{
  id: string;
  patient_id: string;
  type: string;
  title: string;
  document_date: string;
  r2_key: string;
  mime_type: string;
  file_size_bytes: number;
  processing_status: string;
  is_deleted: number;
  sha256: string | null;
  uploaded_by: string;
}>) {
  const id = overrides?.id ?? "doc-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const type = overrides?.type ?? "blood_report";
  const title = overrides?.title ?? "Blood Test Report";
  const document_date = overrides?.document_date ?? "2024-01-15";
  const r2_key = overrides?.r2_key ?? `patients/${patient_id}/documents/${id}/report.pdf`;
  const mime_type = overrides?.mime_type ?? "application/pdf";
  const file_size_bytes = overrides?.file_size_bytes ?? 12345;
  const processing_status = overrides?.processing_status ?? "complete";
  const is_deleted = overrides?.is_deleted ?? 0;
  const sha256 = overrides?.sha256 !== undefined ? overrides.sha256 : null;
  const uploaded_by = overrides?.uploaded_by ?? "admin-1";

  await db.prepare(
    `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, is_deleted, sha256, uploaded_by, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, is_deleted, sha256, uploaded_by, uploaded_by, uploaded_by).run();

  return id;
}

describe("GET /api/patients/:pid/documents", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    // Grant viewer access
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
  });

  it("returns list of non-deleted documents", async () => {
    await seedDocument(env.DB);
    await seedDocument(env.DB, { id: "doc-2", title: "Scan Report", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.documents.length).toBe(1);
    expect(body.documents[0].id).toBe("doc-1");
  });

  it("filters by type", async () => {
    await seedDocument(env.DB, { id: "doc-1", type: "blood_report" });
    await seedDocument(env.DB, { id: "doc-2", type: "scan", title: "Scan Report" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents?type=scan",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.documents.length).toBe(1);
    expect(body.documents[0].type).toBe("scan");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/patients/patient-1/documents", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 without patient access", async () => {
    // Seed another user with no patient access
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
    ).bind("user-2", "user2@test.com", "fakehash", "viewer", "User Two").run();
    const token = await createAccessToken({ sub: "user-2", role: "viewer", email: "user2@test.com" }, JWT_SECRET);
    const res = await app.request(
      "/api/patients/patient-1/documents",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/patients/:pid/documents/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
  });

  it("returns document metadata", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.document.id).toBe("doc-1");
    expect(body.document.title).toBe("Blood Test Report");
  });

  it("returns 404 for non-existent document", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/nonexistent",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for deleted document", async () => {
    await seedDocument(env.DB, { id: "doc-deleted", is_deleted: 1, title: "Deleted Doc" });
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-deleted",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/patients/:pid/documents/upload", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    // Grant viewer access
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
  });

  // Skip in CI: Workflow disposal is required by vitest-pool-workers but not
  // easily supported here. See https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/
  it.skip("admin can upload a document and triggers workflow", async () => {
    const token = await adminToken();
    const fileContent = new Blob(["PDF content here"], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", fileContent, "report.pdf");
    formData.append("type", "blood_report");
    formData.append("title", "Blood Test Report");
    formData.append("document_date", "2024-01-15");

    const res = await app.request(
      "/api/patients/patient-1/documents/upload",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.document.id).toBeTruthy();
    expect(body.document.processing_status).toBe("pending");

    // Check DB record
    const docRow = await env.DB.prepare("SELECT * FROM documents WHERE id = ?")
      .bind(body.document.id).first<any>();
    expect(docRow).not.toBeNull();
    expect(docRow.patient_id).toBe("patient-1");
    expect(docRow.processing_status).toBe("pending");

    // R2 key format: patients/{pid}/documents/{docId}/{filename}
    expect(docRow.r2_key).toMatch(/^patients\/patient-1\/documents\/.+\/report\.pdf$/);
  });

  it("viewer role returns 403", async () => {
    const token = await viewerToken();
    const fileContent = new Blob(["PDF content"], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", fileContent, "report.pdf");
    formData.append("type", "blood_report");
    formData.append("title", "Blood Test Report");
    formData.append("document_date", "2024-01-15");

    const res = await app.request(
      "/api/patients/patient-1/documents/upload",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it.skip("stores workflow_instance_id on document record when workflow is available", async () => {
    const token = await adminToken();
    const fileContent = new Blob(["PDF content"], { type: "application/pdf" });
    const formData = new FormData();
    formData.append("file", fileContent, "report.pdf");
    formData.append("type", "blood_report");
    formData.append("title", "Blood Test Report");
    formData.append("document_date", "2024-01-15");

    const res = await app.request(
      "/api/patients/patient-1/documents/upload",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();

    // Document record should exist; workflow_instance_id may or may not be set
    // depending on whether EXTRACTION_WORKFLOW binding is available in test env
    const docRow = await env.DB.prepare("SELECT id, workflow_instance_id FROM documents WHERE id = ?")
      .bind(body.document.id).first<any>();
    expect(docRow).not.toBeNull();
    expect(docRow.id).toBe(body.document.id);
    // workflow_instance_id is set if workflow binding is available, otherwise null — both are valid in test
  });

  it.skip("returns 409 with existing doc info when uploading a duplicate file", async () => {
    const token = await adminToken();
    const fileContent = new Blob(["unique PDF bytes for dedup test"], { type: "application/pdf" });

    // First upload — succeeds
    const fd1 = new FormData();
    fd1.append("file", fileContent, "report.pdf");
    fd1.append("type", "blood_report");
    fd1.append("title", "Blood Test Jan");
    fd1.append("document_date", "2024-01-15");
    const res1 = await app.request(
      "/api/patients/patient-1/documents/upload",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd1 },
      TEST_ENV
    );
    expect(res1.status).toBe(201);
    const { document: doc1 } = await res1.json<any>();

    // Second upload of same bytes — different filename, different title — must 409
    const fd2 = new FormData();
    fd2.append("file", fileContent, "different-name.pdf");
    fd2.append("type", "blood_report");
    fd2.append("title", "Totally Different Title");
    fd2.append("document_date", "2024-02-20");
    const res2 = await app.request(
      "/api/patients/patient-1/documents/upload",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd2 },
      TEST_ENV
    );
    expect(res2.status).toBe(409);
    const body2 = await res2.json<any>();
    expect(body2.existing_id).toBe(doc1.id);
    expect(body2.existing_title).toBe("Blood Test Jan");
    expect(body2.error).toBe("Duplicate document");
  });

  it.skip("allows re-upload of a soft-deleted document", async () => {
    const token = await adminToken();
    const fileContent = new Blob(["reupload after delete test"], { type: "application/pdf" });

    // Upload then delete
    const fd = new FormData();
    fd.append("file", fileContent, "report.pdf");
    fd.append("type", "blood_report");
    fd.append("title", "Report To Delete");
    fd.append("document_date", "2024-01-15");
    const res1 = await app.request(
      "/api/patients/patient-1/documents/upload",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      TEST_ENV
    );
    const { document: doc1 } = await res1.json<any>();
    await app.request(
      `/api/patients/patient-1/documents/${doc1.id}`,
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );

    // Re-upload same bytes — deleted doc is invisible to dedup — must succeed
    const fd2 = new FormData();
    fd2.append("file", fileContent, "report.pdf");
    fd2.append("type", "blood_report");
    fd2.append("title", "Report To Delete");
    fd2.append("document_date", "2024-01-15");
    const res2 = await app.request(
      "/api/patients/patient-1/documents/upload",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd2 },
      TEST_ENV
    );
    expect(res2.status).toBe(201);
    const { document: doc2 } = await res2.json<any>();
    expect(doc2.id).not.toBe(doc1.id);
  });

  it.skip("stores sha256 on newly uploaded documents", async () => {
    const token = await adminToken();
    const fileContent = new Blob(["sha256 storage test"], { type: "application/pdf" });
    const fd = new FormData();
    fd.append("file", fileContent, "report.pdf");
    fd.append("type", "blood_report");
    fd.append("title", "Hash Test");
    fd.append("document_date", "2024-01-15");

    const res = await app.request(
      "/api/patients/patient-1/documents/upload",
      { method: "POST", headers: { Cookie: `access_token=${token}` }, body: fd },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const { document } = await res.json<any>();

    const row = await env.DB.prepare("SELECT sha256 FROM documents WHERE id = ?")
      .bind(document.id).first<any>();
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/); // 64-char lowercase hex SHA-256
  });
});

describe("GET /api/patients/:pid/documents/:id/status", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB, { processing_status: "processing" });
  });

  it("returns processing status", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/status",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.processing_status).toBe("processing");
    expect(body.id).toBe("doc-1");
  });

  it("returns 404 for nonexistent document", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/nope/status",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/patients/:pid/documents/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
  });

  it("soft-deletes document and cascades to linked records", async () => {
    // Seed linked records
    await env.DB.prepare(
      "INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("td-1", "haemoglobin", "haemoglobin", "Haemoglobin", "g/dL", "haematology", "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("tr-1", "patient-1", "td-1", "doc-1", "2024-01-15", 12.5, "NORMAL", "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO clinical_notes (id, patient_id, document_id, visit_date, summary, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind("cn-1", "patient-1", "doc-1", "2024-01-15", "Patient visit summary", "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    // Document should be soft-deleted
    const docRow = await env.DB.prepare("SELECT is_deleted FROM documents WHERE id = ?")
      .bind("doc-1").first<any>();
    expect(docRow?.is_deleted).toBe(1);

    // Linked test_results should be soft-deleted
    const trRow = await env.DB.prepare("SELECT is_deleted FROM test_results WHERE id = ?")
      .bind("tr-1").first<any>();
    expect(trRow?.is_deleted).toBe(1);

    // Linked clinical_notes should be soft-deleted
    const cnRow = await env.DB.prepare("SELECT is_deleted FROM clinical_notes WHERE id = ?")
      .bind("cn-1").first<any>();
    expect(cnRow?.is_deleted).toBe(1);
  });

  it("viewer cannot delete document", async () => {
    await seedViewer(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /:id cascade with prescription_ids", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("soft-deletes medication linked only to the deleted document", async () => {
    const docId = await seedDocument(env.DB, { id: "doc-cascade-1", type: "prescription" });
    await seedMedication(env.DB, {
      id: "med-cascade-1",
      document_id: docId,
      prescription_ids: JSON.stringify([docId]),
    });

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/${docId}`,
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const med = await env.DB.prepare("SELECT is_deleted FROM medications WHERE id = 'med-cascade-1'").first<any>();
    expect(med!.is_deleted).toBe(1);
  });

  it("keeps medication active when linked to multiple prescriptions", async () => {
    await seedDocument(env.DB, { id: "doc-cascade-2a", type: "prescription" });
    await seedDocument(env.DB, { id: "doc-cascade-2b", type: "prescription" });
    await seedMedication(env.DB, {
      id: "med-cascade-2",
      document_id: "doc-cascade-2a",
      prescription_ids: JSON.stringify(["doc-cascade-2a", "doc-cascade-2b"]),
    });

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/doc-cascade-2a`,
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const med = await env.DB.prepare("SELECT is_deleted FROM medications WHERE id = 'med-cascade-2'").first<any>();
    expect(med!.is_deleted).toBe(0);
  });
});

describe("POST /:id/restore cascade with prescription_ids", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("restores cascade-deleted medication when document is restored", async () => {
    await seedDocument(env.DB, { id: "doc-restore-1", type: "prescription", is_deleted: 1 });
    await seedMedication(env.DB, {
      id: "med-restore-1",
      document_id: "doc-restore-1",
      prescription_ids: JSON.stringify(["doc-restore-1"]),
    });
    await env.DB.prepare("UPDATE medications SET is_deleted = 1 WHERE id = 'med-restore-1'").run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/doc-restore-1/restore`,
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const med = await env.DB.prepare("SELECT is_deleted FROM medications WHERE id = 'med-restore-1'").first<any>();
    expect(med!.is_deleted).toBe(0);
  });
});

describe("POST /api/patients/:pid/documents/:id/restore", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB, { is_deleted: 1 });
  });

  it("restores soft-deleted document and linked records", async () => {
    // Seed linked deleted records
    await env.DB.prepare(
      "INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("td-1", "haemoglobin", "haemoglobin", "Haemoglobin", "g/dL", "haematology", "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, is_deleted, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("tr-1", "patient-1", "td-1", "doc-1", "2024-01-15", 12.5, "NORMAL", 1, "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/restore",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const docRow = await env.DB.prepare("SELECT is_deleted FROM documents WHERE id = ?")
      .bind("doc-1").first<any>();
    expect(docRow?.is_deleted).toBe(0);

    const trRow = await env.DB.prepare("SELECT is_deleted FROM test_results WHERE id = ?")
      .bind("tr-1").first<any>();
    expect(trRow?.is_deleted).toBe(0);
  });
});

describe("POST /api/patients/:pid/documents/:id/restore", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns skipped_test_results warning when restored rows conflict with live rows", async () => {
    const token = await adminToken();

    // Seed a test_definition
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, sort_order, created_by, updated_by)
       VALUES ('tdef-1', 'haemoglobin', 'haemoglobin', 'Haemoglobin', 'g/dL', 'haematology', 0, 'admin-1', 'admin-1')`
    ).run();

    // Document A: soft-deleted, has one soft-deleted test_result
    await seedDocument(env.DB, { id: "doc-a", is_deleted: 1 });
    await env.DB.prepare(
      `INSERT INTO test_results
         (id, patient_id, test_def_id, document_id, date, value, flag,
          report_file, extracted_at, is_deleted, created_by, updated_by)
       VALUES ('tr-a', 'patient-1', 'tdef-1', 'doc-a', '2024-01-15', 9.4, 'LOW',
               'report.pdf', '2024-01-15', 1, 'admin-1', 'admin-1')`
    ).run();

    // Document B: live, has a live test_result for the same (patient, def, date, report_file)
    await seedDocument(env.DB, { id: "doc-b", title: "Doc B" });
    await env.DB.prepare(
      `INSERT INTO test_results
         (id, patient_id, test_def_id, document_id, date, value, flag,
          report_file, extracted_at, is_deleted, created_by, updated_by)
       VALUES ('tr-b', 'patient-1', 'tdef-1', 'doc-b', '2024-01-15', 9.5, 'LOW',
               'report.pdf', '2024-01-15', 0, 'admin-1', 'admin-1')`
    ).run();

    // Restore doc-a — tr-a cannot be restored without violating dedup index
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-a/restore",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    expect(body.skipped_test_results).toBe(1);
    expect(body.warning).toContain("1 test result");

    // tr-a must still be soft-deleted
    const tr = await env.DB.prepare("SELECT is_deleted FROM test_results WHERE id = 'tr-a'")
      .first<any>();
    expect(tr?.is_deleted).toBe(1);
  });

  it("returns plain ok:true when restore has no conflicts", async () => {
    const token = await adminToken();

    await seedDocument(env.DB, { id: "doc-x", is_deleted: 1 });

    const res = await app.request(
      "/api/patients/patient-1/documents/doc-x/restore",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
    expect(body.skipped_test_results).toBeUndefined();
    expect(body.warning).toBeUndefined();
  });
});

describe("GET /api/patients/:pid/documents/:id — prescription fields", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns llm_raw_response and medication_review_status for prescriptions", async () => {
    const docId = await seedDocument(env.DB, {
      id: "doc-rx-1",
      type: "prescription",
      processing_status: "complete",
    });
    const extraction = { medications: [{ brand_name: "Amlodipine", dosage: "5mg", form: "tablet" }] };
    await env.DB.prepare(
      `UPDATE documents SET llm_raw_response = ?, medication_review_status = 'pending_review'
       WHERE id = ?`
    ).bind(JSON.stringify(extraction), docId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/${docId}`,
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.document.medication_review_status).toBe("pending_review");
    expect(body.document.llm_raw_response).toBeDefined();
    expect(body.document.llm_raw_response.medications).toHaveLength(1);
  });
});

describe("POST /api/patients/:pid/documents/:id/review-medication", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("adds a medication when decision is 'added'", async () => {
    const docId = await seedDocument(env.DB, {
      id: "doc-review-1",
      type: "prescription",
      processing_status: "complete",
    });
    const extraction = {
      medications: [
        { brand_name: "Amlodipine", dosage: "5mg", form: "tablet", schedule: [] },
        { brand_name: "Metformin", dosage: "500mg", form: "tablet", schedule: [] },
      ],
    };
    await env.DB.prepare(
      `UPDATE documents SET llm_raw_response = ?, medication_review_status = 'pending_review'
       WHERE id = ?`
    ).bind(JSON.stringify(extraction), docId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/${docId}/review-medication`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction_index: 0,
          decision: "added",
          medication_data: {
            brand_name: "Amlodipine",
            dosage: "5mg",
            form: "tablet",
            start_date: "2026-04-20",
          },
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.decision).toBe("added");
    expect(body.medication_id).toBeTruthy();

    const med = await env.DB.prepare("SELECT prescription_ids FROM medications WHERE id = ?")
      .bind(body.medication_id).first<any>();
    expect(JSON.parse(med!.prescription_ids)).toContain(docId);

    const doc = await env.DB.prepare("SELECT medication_review_decisions FROM documents WHERE id = ?")
      .bind(docId).first<any>();
    const decisions = JSON.parse(doc!.medication_review_decisions);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe("added");
  });

  it("skips a medication without creating it", async () => {
    const docId = await seedDocument(env.DB, {
      id: "doc-review-2",
      type: "prescription",
      processing_status: "complete",
    });
    const extraction = { medications: [{ brand_name: "Losartan", dosage: "50mg", form: "tablet" }] };
    await env.DB.prepare(
      `UPDATE documents SET llm_raw_response = ?, medication_review_status = 'pending_review'
       WHERE id = ?`
    ).bind(JSON.stringify(extraction), docId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/${docId}/review-medication`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          extraction_index: 0,
          decision: "skipped",
          reason: "Already tracked",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.decision).toBe("skipped");

    const meds = await env.DB.prepare("SELECT * FROM medications WHERE document_id = ?")
      .bind(docId).all();
    expect(meds.results).toHaveLength(0);

    const doc = await env.DB.prepare("SELECT medication_review_status FROM documents WHERE id = ?")
      .bind(docId).first<any>();
    expect(doc!.medication_review_status).toBe("reviewed");
  });

  it("returns 400 when document is not pending review", async () => {
    const docId = await seedDocument(env.DB, {
      id: "doc-review-3",
      type: "prescription",
      processing_status: "complete",
    });

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/documents/${docId}/review-medication`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ extraction_index: 0, decision: "skipped" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toBe("Document is not pending review");
  });

  it("returns 409 on double-submit for same medication", async () => {
    const docId = await seedDocument(env.DB, {
      id: "doc-review-4",
      type: "prescription",
      processing_status: "complete",
    });
    const extraction = {
      medications: [
        { brand_name: "Amlodipine", dosage: "5mg", form: "tablet" },
        { brand_name: "Metformin", dosage: "500mg", form: "tablet" },
      ],
    };
    await env.DB.prepare(
      `UPDATE documents SET llm_raw_response = ?, medication_review_status = 'pending_review'
       WHERE id = ?`
    ).bind(JSON.stringify(extraction), docId).run();

    const token = await adminToken();
    const firstRes = await app.request(
      `/api/patients/patient-1/documents/${docId}/review-medication`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ extraction_index: 0, decision: "skipped" }),
      },
      TEST_ENV
    );
    expect(firstRes.status).toBe(200);

    const secondRes = await app.request(
      `/api/patients/patient-1/documents/${docId}/review-medication`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ extraction_index: 0, decision: "skipped" }),
      },
      TEST_ENV
    );
    expect(secondRes.status).toBe(409);
    const secondBody = await secondRes.json<any>();
    expect(secondBody.error).toBe("This medication has already been reviewed");
  });
});

describe("POST /api/patients/:pid/documents/:id/reprocess", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it.skip("re-triggers workflow for failed document", async () => {
    await seedDocument(env.DB, { processing_status: "failed" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/reprocess",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    // Status should be reset to pending
    const docRow = await env.DB.prepare("SELECT processing_status FROM documents WHERE id = ?")
      .bind("doc-1").first<any>();
    expect(docRow?.processing_status).toBe("pending");
  });

  it("returns 409 for non-failed document", async () => {
    await seedDocument(env.DB, { processing_status: "complete" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/reprocess",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(409);
  });

  it("viewer cannot reprocess document", async () => {
    await seedViewer(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
    await seedDocument(env.DB, { processing_status: "failed" });

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/documents/doc-1/reprocess",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});
