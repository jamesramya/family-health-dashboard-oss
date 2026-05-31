import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient, seedDocument } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function seedShareLink(rawToken: string, patientId = "patient-1") {
  const tokenHash = await sha256hex(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
     VALUES (?, ?, ?, '["read"]', ?, 'admin-1')`
  ).bind(crypto.randomUUID(), tokenHash, JSON.stringify([patientId]), expiresAt).run();
}

describe("GET /api/share/:token/labs", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns BloodWorkCategory[] for a valid token", async () => {
    await seedShareLink("labs-tok-1");
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_name, label, unit, category, ref_low, ref_high, sort_order, created_by, updated_by)
       VALUES ('td-hgb', 'hemoglobin', 'Hemoglobin', 'g/dL', 'haematology', 13, 17, 1, 'admin-1', 'admin-1')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1', 'patient-1', 'td-hgb', '2025-01-01', 14.5, 'NORMAL', 'admin-1', 'admin-1')`
    ).run();

    const res = await app.request("/api/share/labs-tok-1/labs", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ categories: { category: string; tests: { label: string; readings: { value: number }[] }[] }[] }>();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories[0].category).toBe("haematology");
    expect(body.categories[0].tests[0].label).toBe("Hemoglobin");
    expect(body.categories[0].tests[0].readings[0].value).toBe(14.5);
  });

  it("expired token → 410", async () => {
    const tokenHash = await sha256hex("labs-expired");
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-x', ?, '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(tokenHash, new Date(Date.now() - 1000).toISOString()).run();
    const res = await app.request("/api/share/labs-expired/labs", {}, TEST_ENV);
    expect(res.status).toBe(410);
  });

  it("unknown token → 404", async () => {
    const res = await app.request("/api/share/nope/labs", {}, TEST_ENV);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/share/:token/vitals", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns vitals for the patient on a valid token", async () => {
    await seedShareLink("vit-tok-1");
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, value_secondary, unit, created_by, updated_by)
       VALUES ('v1', 'patient-1', 'bp', '2025-01-01T08:00:00Z', 120, 80, 'mmHg', 'admin-1', 'admin-1')`
    ).run();
    const res = await app.request("/api/share/vit-tok-1/vitals", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ vitals: { type: string; value_primary: number }[] }>();
    expect(body.vitals).toHaveLength(1);
    expect(body.vitals[0].type).toBe("bp");
    expect(body.vitals[0].value_primary).toBe(120);
  });

  it("filters by ?type=bp", async () => {
    await seedShareLink("vit-tok-2");
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, unit, created_by, updated_by)
       VALUES ('v1', 'patient-1', 'bp', '2025-01-01T08:00:00Z', 120, 'mmHg', 'admin-1', 'admin-1'),
              ('v2', 'patient-1', 'weight', '2025-01-02T08:00:00Z', 70, 'kg', 'admin-1', 'admin-1')`
    ).run();
    const res = await app.request("/api/share/vit-tok-2/vitals?type=bp", {}, TEST_ENV);
    const body = await res.json<{ vitals: { type: string }[] }>();
    expect(body.vitals).toHaveLength(1);
    expect(body.vitals[0].type).toBe("bp");
  });
});

describe("GET /api/share/:token/medications", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns medications with schedules for a valid token", async () => {
    await seedShareLink("med-tok-1");
    await env.DB.prepare(
      `INSERT INTO medications (id, patient_id, brand_name, dosage, form, start_date, is_active, lifecycle_events, prescription_ids, created_by, updated_by)
       VALUES ('m1', 'patient-1', 'Crocin', '500mg', 'tablet', '2025-01-01', 1, '[]', '[]', 'admin-1', 'admin-1')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES ('s1', 'm1', 'morning', 'after_meal', '1', 'admin-1', 'admin-1')`
    ).run();

    const res = await app.request("/api/share/med-tok-1/medications", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ medications: { brand_name: string; schedules: { time_of_day: string }[] }[] }>();
    expect(body.medications).toHaveLength(1);
    expect(body.medications[0].brand_name).toBe("Crocin");
    expect(body.medications[0].schedules).toHaveLength(1);
    expect(body.medications[0].schedules[0].time_of_day).toBe("morning");
  });
});

describe("GET /api/share/:token/scans", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns scans for a valid token", async () => {
    await seedShareLink("scan-tok-1");
    const docId = await seedDocument(env.DB, { id: "doc-scan-1" });
    await env.DB.prepare(
      `INSERT INTO scan_findings (id, patient_id, document_id, scan_type, body_area, findings_summary, scan_date, created_by, updated_by)
       VALUES ('sc1', 'patient-1', ?, 'xray', 'Chest', 'Clear lungs.', '2025-02-01', 'admin-1', 'admin-1')`
    ).bind(docId).run();
    const res = await app.request("/api/share/scan-tok-1/scans", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ scans: { scan_type: string; findings_summary: string }[] }>();
    expect(body.scans).toHaveLength(1);
    expect(body.scans[0].scan_type).toBe("xray");
    expect(body.scans[0].findings_summary).toBe("Clear lungs.");
  });
});

describe("GET /api/share/:token/documents", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns documents list, no r2_key leaked", async () => {
    await seedShareLink("doc-tok-1");
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, source_lab, processing_status, uploaded_by, created_by, updated_by)
       VALUES ('d1', 'patient-1', 'blood_report', 'CBC Jan 2025', '2025-01-01', 'patients/p1/d1/cbc.pdf', 'application/pdf', 12345, 'Quest', 'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).run();
    const res = await app.request("/api/share/doc-tok-1/documents", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ documents: { title: string; r2_key?: string }[] }>();
    expect(body.documents).toHaveLength(1);
    expect(body.documents[0].title).toBe("CBC Jan 2025");
    expect(body.documents[0].r2_key).toBeUndefined();
  });
});

describe("GET /api/share/:token/documents/:docId/file", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("streams the R2 object for a valid token + doc", async () => {
    await seedShareLink("file-tok-1");
    const r2Key = "patients/patient-1/documents/d1/test.txt";
    await env.BUCKET.put(r2Key, "hello physician");
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES ('d1', 'patient-1', 'blood_report', 'Test', '2025-01-01', ?, 'text/plain', 15, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).bind(r2Key).run();

    const res = await app.request("/api/share/file-tok-1/documents/d1/file", {}, TEST_ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    const body = await res.text();
    expect(body).toBe("hello physician");
  });

  it("404 when doc belongs to a different patient", async () => {
    await seedShareLink("file-tok-2");
    await env.DB.prepare(
      `INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by)
       VALUES ('patient-2', 'Other', '1990-01-01', 'M', 'admin-1', 'admin-1')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES ('d2', 'patient-2', 'blood_report', 'Other', '2025-01-01', 'patients/patient-2/d2/x.txt', 'text/plain', 6, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).run();
    const res = await app.request("/api/share/file-tok-2/documents/d2/file", {}, TEST_ENV);
    expect(res.status).toBe(404);
  });
});
