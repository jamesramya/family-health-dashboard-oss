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

async function seedDocument(db: D1Database, overrides?: Partial<{
  id: string;
  patient_id: string;
  type: string;
  title: string;
  document_date: string;
  r2_key: string;
  created_at: string;
}>) {
  const id = overrides?.id ?? "doc-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const type = overrides?.type ?? "blood_report";
  const title = overrides?.title ?? "Blood Test Report";
  const document_date = overrides?.document_date ?? "2024-01-15";
  const r2_key = overrides?.r2_key ?? `patients/${patient_id}/documents/${id}/report.pdf`;
  const created_at = overrides?.created_at;

  if (created_at) {
    await db.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, patient_id, type, title, document_date, r2_key, "application/pdf", 12345, "complete", "admin-1", "admin-1", "admin-1", created_at).run();
  } else {
    await db.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, patient_id, type, title, document_date, r2_key, "application/pdf", 12345, "complete", "admin-1", "admin-1", "admin-1").run();
  }
  return id;
}

describe("GET /api/patients/:pid/dashboard/summary", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns correct patient info", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.patient).toBeDefined();
    expect(body.patient.id).toBe("patient-1");
    expect(body.patient.name).toBe("Demo Patient");
    expect(body.patient.date_of_birth).toBe("1951-05-26");
    expect(body.patient.gender).toBe("female");
  });

  it("returns up to 10 readings per type, newest first (sparkline series)", async () => {
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, value_secondary, unit, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("vr-1", "patient-1", "bp", "2024-01-01T10:00:00Z", 130, 85, "mmHg", "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, value_secondary, unit, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("vr-2", "patient-1", "bp", "2024-02-01T10:00:00Z", 125, 80, "mmHg", "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, unit, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("vr-3", "patient-1", "heart_rate", "2024-02-01T10:00:00Z", 72, "bpm", "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.latest_vitals).toBeDefined();
    // Two BP readings + one heart_rate reading = 3 rows total
    expect(body.latest_vitals.length).toBe(3);

    const bpReadings = body.latest_vitals.filter((v: any) => v.type === "bp");
    expect(bpReadings.length).toBe(2);
    // Newest first within each type
    expect(bpReadings[0].id).toBe("vr-2");
    expect(bpReadings[0].value_primary).toBe(125);
    expect(bpReadings[1].id).toBe("vr-1");
  });

  it("caps each type's series at 30 readings", async () => {
    for (let i = 0; i < 35; i++) {
      const month = String(Math.floor(i / 28) + 1).padStart(2, "0");
      const day = String((i % 28) + 1).padStart(2, "0");
      await env.DB.prepare(
        `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, value_secondary, unit, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(`vr-${i}`, "patient-1", "bp", `2024-${month}-${day}T10:00:00Z`, 120 + i, 80, "mmHg", "admin-1", "admin-1").run();
    }

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await res.json<any>();
    const bpReadings = body.latest_vitals.filter((v: any) => v.type === "bp");
    expect(bpReadings.length).toBe(30);
    // Newest 30 of 35: indices 5..34, ordered newest first
    expect(bpReadings[0].id).toBe("vr-34");
    expect(bpReadings[29].id).toBe("vr-5");
  });

  it("blood work alerts include ref_low_at_test and ref_high_at_test from test_definitions", async () => {
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, sort_order, ref_low, ref_high, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("td-ref", "glucose", "glucose", "Glucose", "mmol/L", "blood_glucose", 1, 4.0, 7.8, "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("tr-ref", "patient-1", "td-ref", "2024-01-15", 9.5, "HIGH", "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await res.json<any>();
    const alert = body.blood_work_alerts.find((a: any) => a.id === "tr-ref");
    expect(alert).toBeDefined();
    expect(alert.ref_low_at_test).toBe(4.0);
    expect(alert.ref_high_at_test).toBe(7.8);
  });

  it("blood work alerts matches blood-work/alerts logic", async () => {
    // Seed a test definition and a flagged result
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, sort_order, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("td-1", "haemoglobin", "haemoglobin", "Haemoglobin", "g/dL", "haematology", 1, "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("tr-1", "patient-1", "td-1", "2024-01-15", 18.0, "HIGH", "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.blood_work_alerts).toBeDefined();
    expect(body.blood_work_alerts.length).toBe(1);
    expect(body.blood_work_alerts[0].flag).toBe("HIGH");
  });

  it("returns active medications count", async () => {
    // Seed active and inactive medications
    await env.DB.prepare(
      `INSERT INTO medications (id, patient_id, brand_name, dosage, form, start_date, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("med-1", "patient-1", "Metformin", "500mg", "tablet", "2024-01-01", 1, "admin-1", "admin-1").run();
    await env.DB.prepare(
      `INSERT INTO medications (id, patient_id, brand_name, dosage, form, start_date, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("med-2", "patient-1", "Aspirin", "100mg", "tablet", "2024-01-01", 0, "admin-1", "admin-1").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.active_medications_count).toBe(1);
  });

  it("returns recent documents ordered by recency, limited to 5", async () => {
    // Seed 6 documents with different timestamps
    for (let i = 1; i <= 6; i++) {
      await seedDocument(env.DB, {
        id: `doc-${i}`,
        title: `Document ${i}`,
        created_at: `2024-0${i}-01T10:00:00`,
      });
    }

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.recent_documents).toBeDefined();
    expect(body.recent_documents.length).toBe(5);
    // Most recent first (doc-6 has the latest created_at)
    expect(body.recent_documents[0].id).toBe("doc-6");
  });

  it("includes pending_prescription_reviews count", async () => {
    await seedDocument(env.DB, {
      id: "doc-pending-rx",
      type: "prescription",
    });
    await env.DB.prepare(
      "UPDATE documents SET medication_review_status = 'pending_review' WHERE id = 'doc-pending-rx'"
    ).run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.pending_prescription_reviews).toBe(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      {},
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("last_activity is null when patient has no domain records", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.last_activity).toBeNull();
  });

  it("last_activity equals MAX updated_at across domain tables", async () => {
    // Seed a document with a known updated_at — this is the expected max
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      "doc-activity-1", "patient-1", "blood_report", "Report A", "2026-04-01",
      "patients/patient-1/documents/doc-activity-1/report.pdf",
      "application/pdf", 12345, "complete",
      "admin-1", "admin-1", "admin-1",
      "2026-04-01T10:00:00Z"
    ).run();

    // Seed a vital reading with an earlier updated_at — should not be the max
    await env.DB.prepare(
      `INSERT INTO vital_readings (id, patient_id, type, measured_at, value_primary, unit, created_by, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      "vr-activity-1", "patient-1", "bp", "2026-03-01T08:00:00Z",
      120, "mmHg", "admin-1", "admin-1",
      "2026-03-01T08:00:00Z"
    ).run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/dashboard/summary",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.last_activity).toBe("2026-04-01T10:00:00Z");
  });
});
