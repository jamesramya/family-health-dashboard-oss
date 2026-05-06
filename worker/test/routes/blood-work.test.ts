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

async function seedTestDefinition(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    canonical_key: string;
    canonical_name: string;
    label: string;
    unit: string;
    category: string;
    sort_order: number;
    ref_low: number;
    ref_high: number;
  }>
) {
  const id = overrides?.id ?? "td-1";
  const canonical_name = overrides?.canonical_name ?? "haemoglobin";
  const canonical_key = overrides?.canonical_key ?? canonical_name;
  const label = overrides?.label ?? "Haemoglobin";
  const unit = overrides?.unit ?? "g/dL";
  const category = overrides?.category ?? "haematology";
  const sort_order = overrides?.sort_order ?? 0;
  const ref_low = overrides?.ref_low ?? 12.0;
  const ref_high = overrides?.ref_high ?? 16.0;

  await db.prepare(
    `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, sort_order, ref_low, ref_high, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, canonical_key, canonical_name, label, unit, category, sort_order, ref_low, ref_high, "admin-1", "admin-1").run();
  return id;
}

async function seedTestResult(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    patient_id: string;
    test_def_id: string;
    date: string;
    value: number;
    flag: string;
    is_deleted: number;
    document_id: string | null;
  }>
) {
  const id = overrides?.id ?? "tr-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const test_def_id = overrides?.test_def_id ?? "td-1";
  const date = overrides?.date ?? "2024-01-15";
  const value = overrides?.value ?? 13.5;
  const flag = overrides?.flag ?? "NORMAL";
  const is_deleted = overrides?.is_deleted ?? 0;
  const document_id = overrides?.document_id ?? null;

  await db.prepare(
    `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, is_deleted, document_id, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, patient_id, test_def_id, date, value, flag, is_deleted, document_id, "admin-1", "admin-1").run();
  return id;
}

describe("GET /api/patients/:pid/blood-work", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns test definitions grouped by category, sorted by sort_order", async () => {
    // Seed two test defs in same category
    await seedTestDefinition(env.DB, { id: "td-1", canonical_name: "haemoglobin", label: "Haemoglobin", category: "haematology", sort_order: 1 });
    await seedTestDefinition(env.DB, { id: "td-2", canonical_name: "wbc", label: "WBC", category: "haematology", sort_order: 2 });
    await seedTestDefinition(env.DB, { id: "td-3", canonical_name: "sodium", label: "Sodium", category: "electrolytes", sort_order: 1, unit: "mmol/L" });

    // Seed results for patient-1
    await seedTestResult(env.DB, { id: "tr-1", test_def_id: "td-1", value: 13.5, flag: "NORMAL" });
    await seedTestResult(env.DB, { id: "tr-2", test_def_id: "td-2", value: 7.5, flag: "NORMAL" });
    await seedTestResult(env.DB, { id: "tr-3", test_def_id: "td-3", value: 140, flag: "NORMAL" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    // Should have two categories
    expect(body.categories).toBeDefined();
    const catNames = body.categories.map((c: any) => c.category);
    expect(catNames).toContain("haematology");
    expect(catNames).toContain("electrolytes");

    // Haematology should have two tests, sorted by sort_order
    const haem = body.categories.find((c: any) => c.category === "haematology");
    expect(haem.tests.length).toBe(2);
    expect(haem.tests[0].canonical_name).toBe("haemoglobin");
    expect(haem.tests[1].canonical_name).toBe("wbc");
  });

  it("only returns non-deleted readings for specified patient", async () => {
    await seedTestDefinition(env.DB);
    await seedTestResult(env.DB, { id: "tr-1", flag: "NORMAL" });
    await seedTestResult(env.DB, { id: "tr-2", flag: "HIGH", is_deleted: 1 });

    // Different patient result should not appear
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind("patient-2", "Other", "1960-01-01", "male", "admin-1", "admin-1").run();
    await seedTestResult(env.DB, { id: "tr-3", patient_id: "patient-2", flag: "LOW" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    // Flatten all results across all categories
    const allResults = body.categories.flatMap((c: any) =>
      c.tests.flatMap((t: any) => t.readings ?? [])
    );
    // Only 1 result (non-deleted, for patient-1)
    expect(allResults.length).toBe(1);
    expect(allResults[0].id).toBe("tr-1");
  });
});

describe("GET /api/patients/:pid/blood-work/alerts", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns only latest reading per test where flag is HIGH or LOW", async () => {
    await seedTestDefinition(env.DB, { id: "td-1", canonical_name: "haemoglobin", label: "Haemoglobin" });
    await seedTestDefinition(env.DB, { id: "td-2", canonical_name: "wbc", label: "WBC", unit: "10^9/L" });

    // Two readings for haemoglobin: older NORMAL, newer HIGH
    await seedTestResult(env.DB, { id: "tr-1", test_def_id: "td-1", date: "2024-01-01", flag: "NORMAL", value: 13.0 });
    await seedTestResult(env.DB, { id: "tr-2", test_def_id: "td-1", date: "2024-02-01", flag: "HIGH", value: 18.0 });

    // One reading for wbc: NORMAL (should not appear)
    await seedTestResult(env.DB, { id: "tr-3", test_def_id: "td-2", date: "2024-02-01", flag: "NORMAL", value: 7.5 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/alerts",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    // Only haemoglobin should appear (latest reading is HIGH)
    expect(body.alerts.length).toBe(1);
    expect(body.alerts[0].test_def_id).toBe("td-1");
    expect(body.alerts[0].flag).toBe("HIGH");
    expect(body.alerts[0].value).toBe(18.0);
  });

  it("returns empty array when no flagged readings", async () => {
    await seedTestDefinition(env.DB);
    await seedTestResult(env.DB, { flag: "NORMAL" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/alerts",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.alerts).toEqual([]);
  });
});

describe("GET /api/patients/:pid/blood-work/:testId/trend", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedTestDefinition(env.DB);
  });

  it("returns chronological readings for one test", async () => {
    await seedTestResult(env.DB, { id: "tr-1", date: "2024-03-01", value: 13.0, flag: "NORMAL" });
    await seedTestResult(env.DB, { id: "tr-2", date: "2024-01-01", value: 11.0, flag: "LOW" });
    await seedTestResult(env.DB, { id: "tr-3", date: "2024-02-01", value: 14.0, flag: "NORMAL" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/td-1/trend",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();

    expect(body.readings.length).toBe(3);
    // Should be ordered by date ascending
    expect(body.readings[0].id).toBe("tr-2"); // 2024-01-01
    expect(body.readings[1].id).toBe("tr-3"); // 2024-02-01
    expect(body.readings[2].id).toBe("tr-1"); // 2024-03-01
  });

  it("excludes deleted readings", async () => {
    await seedTestResult(env.DB, { id: "tr-1", date: "2024-01-01", flag: "NORMAL" });
    await seedTestResult(env.DB, { id: "tr-2", date: "2024-02-01", flag: "HIGH", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/td-1/trend",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.readings.length).toBe(1);
    expect(body.readings[0].id).toBe("tr-1");
  });

  it("returns 404 for unknown test definition", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/nonexistent/trend",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("blood-work API per-reading ref range", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, ref_low, ref_high, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes', 136, 145, 'admin-1','admin-1')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, date, value, flag, ref_low_at_test, ref_high_at_test, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-sodium','2026-03-15', 140, 'NORMAL', 135, 146, 'admin-1','admin-1')`,
    ).run();
  });

  it("GET / route returns ref_low_at_test and ref_high_at_test in readings", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    const electrolytes = body.categories.find((c: any) => c.category === "electrolytes");
    expect(electrolytes).toBeDefined();
    const sodium = electrolytes.tests.find((t: any) => t.id === "td-sodium");
    expect(sodium).toBeDefined();
    expect(sodium.readings.length).toBe(1);
    expect(sodium.readings[0].ref_low_at_test).toBe(135);
    expect(sodium.readings[0].ref_high_at_test).toBe(146);
  });

  it("trend route returns ref_low_at_test and ref_high_at_test", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work/td-sodium/trend",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.readings.length).toBe(1);
    expect(body.readings[0].ref_low_at_test).toBe(135);
    expect(body.readings[0].ref_high_at_test).toBe(146);
  });
});

describe("GET /api/patients/:pid/blood-work?document_id=", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns flat results array filtered by document_id", async () => {
    // Seed documents first (foreign key targets)
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES (?, ?, 'blood_report', 'Report 1', '2024-01-15', 'r2/doc-1.pdf', 'application/pdf', 1000, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).bind("doc-1", "patient-1").run();
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
       VALUES (?, ?, 'blood_report', 'Report 2', '2024-06-01', 'r2/doc-2.pdf', 'application/pdf', 1000, 'complete', 'admin-1', 'admin-1', 'admin-1')`
    ).bind("doc-2", "patient-1").run();
    await seedTestDefinition(env.DB, { id: "td-1", label: "Haemoglobin", unit: "g/dL", category: "haematology" });
    await seedTestDefinition(env.DB, { id: "td-2", label: "WBC", unit: "/μL", category: "haematology", canonical_key: "wbc", canonical_name: "wbc" });
    await seedTestResult(env.DB, { id: "tr-1", test_def_id: "td-1", document_id: "doc-1" });
    await seedTestResult(env.DB, { id: "tr-2", test_def_id: "td-2", document_id: "doc-1" });
    await seedTestResult(env.DB, { id: "tr-3", test_def_id: "td-1", document_id: "doc-2", date: "2024-06-01" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work?document_id=doc-1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.results).toBeDefined();
    expect(body.categories).toBeUndefined();
    expect(body.results.length).toBe(2);
    expect(body.results[0].label).toBe("Haemoglobin");
    expect(body.results[0].category).toBe("haematology");
  });

  it("returns normal nested categories when no document_id", async () => {
    await seedTestDefinition(env.DB);
    await seedTestResult(env.DB);

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/blood-work",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.categories).toBeDefined();
    expect(body.results).toBeUndefined();
  });
});
