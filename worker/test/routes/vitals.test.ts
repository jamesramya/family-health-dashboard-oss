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

async function seedVital(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    patient_id: string;
    type: string;
    measured_at: string;
    value_primary: number;
    value_secondary: number | null;
    unit: string;
    source: string;
    is_deleted: number;
  }>
) {
  const id = overrides?.id ?? "vital-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const type = overrides?.type ?? "bp";
  const measured_at = overrides?.measured_at ?? "2024-01-15T08:00:00Z";
  const value_primary = overrides?.value_primary ?? 120;
  const value_secondary = overrides?.value_secondary ?? 80;
  const unit = overrides?.unit ?? "mmHg";
  const source = overrides?.source ?? "manual";
  const is_deleted = overrides?.is_deleted ?? 0;

  await db
    .prepare(
      `INSERT INTO vital_readings
        (id, patient_id, type, measured_at, value_primary, value_secondary, unit, source, is_deleted, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    )
    .bind(id, patient_id, type, measured_at, value_primary, value_secondary, unit, source, is_deleted)
    .run();
  return id;
}

describe("GET /api/patients/:pid/vitals", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("returns all non-deleted vitals for the patient", async () => {
    await seedVital(env.DB, { id: "vital-1" });
    await seedVital(env.DB, { id: "vital-2", type: "glucose", unit: "mmol/L", value_primary: 5.4, value_secondary: null, is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.vitals.length).toBe(1);
    expect(body.vitals[0].id).toBe("vital-1");
  });

  it("filters by type", async () => {
    await seedVital(env.DB, { id: "vital-1", type: "bp" });
    await seedVital(env.DB, { id: "vital-2", type: "glucose", unit: "mmol/L", value_primary: 5.4, value_secondary: null });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals?type=glucose",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.vitals.length).toBe(1);
    expect(body.vitals[0].type).toBe("glucose");
  });

  it("filters by date range", async () => {
    await seedVital(env.DB, { id: "vital-1", measured_at: "2024-01-10T08:00:00Z" });
    await seedVital(env.DB, { id: "vital-2", measured_at: "2024-03-01T08:00:00Z", type: "glucose", unit: "mmol/L", value_primary: 5.4, value_secondary: null });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals?date_from=2024-02-01",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.vitals.length).toBe(1);
    expect(body.vitals[0].id).toBe("vital-2");
  });

  it("includes readings on the date_to day when date_to is YYYY-MM-DD", async () => {
    // Regression: measured_at is full ISO; comparing "2024-03-01T08:00:00Z" <= "2024-03-01"
    // is false lexically, so date-only date_to was excluding readings on the cutoff day.
    await seedVital(env.DB, { id: "vital-1", measured_at: "2024-02-15T08:00:00Z" });
    await seedVital(env.DB, { id: "vital-on-cutoff-day", measured_at: "2024-03-01T08:00:00Z", type: "glucose", unit: "mmol/L", value_primary: 5.4, value_secondary: null });
    await seedVital(env.DB, { id: "vital-after", measured_at: "2024-03-02T00:00:00Z", type: "glucose", unit: "mmol/L", value_primary: 5.5, value_secondary: null });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals?date_from=2024-02-01&date_to=2024-03-01",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    const ids = body.vitals.map((v: any) => v.id).sort();
    expect(ids).toEqual(["vital-1", "vital-on-cutoff-day"]);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/patients/patient-1/vitals", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns 403 without patient access", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?)"
    ).bind("user-x", "userx@test.com", "fakehash", "viewer", "User X").run();
    const token = await createAccessToken({ sub: "user-x", role: "viewer", email: "userx@test.com" }, JWT_SECRET);
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("viewer can read vitals", async () => {
    await seedVital(env.DB);
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });
});

describe("GET /api/patients/:pid/vitals/latest", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns latest reading per type", async () => {
    await seedVital(env.DB, { id: "bp-old", type: "bp", measured_at: "2024-01-01T08:00:00Z" });
    await seedVital(env.DB, { id: "bp-new", type: "bp", measured_at: "2024-06-01T08:00:00Z" });
    await seedVital(env.DB, { id: "glucose-1", type: "glucose", measured_at: "2024-05-01T08:00:00Z", unit: "mmol/L", value_primary: 5.4, value_secondary: null });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/latest",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    // Should have 2 entries: latest bp + latest glucose
    expect(body.vitals.length).toBe(2);
    const bpEntry = body.vitals.find((v: any) => v.type === "bp");
    expect(bpEntry?.id).toBe("bp-new");
  });

  it("excludes deleted readings", async () => {
    await seedVital(env.DB, { id: "bp-deleted", type: "bp", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/latest",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.vitals.length).toBe(0);
  });
});

describe("POST /api/patients/:pid/vitals", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can create a vital reading", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bp",
          measured_at: "2024-06-01T09:00:00Z",
          value_primary: 118,
          value_secondary: 76,
          unit: "mmHg",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.vital.type).toBe("bp");
    expect(body.vital.value_primary).toBe(118);
  });

  it("returns 400 for missing required fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "bp" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "invalid_type",
          measured_at: "2024-06-01T09:00:00Z",
          value_primary: 100,
          unit: "mmHg",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("viewer cannot create vital reading", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bp",
          measured_at: "2024-06-01T09:00:00Z",
          value_primary: 120,
          unit: "mmHg",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/patients/:pid/vitals/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedVital(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can update a vital reading", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/vital-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value_primary: 125, notes: "Taken after exercise" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.vital.value_primary).toBe(125);
    expect(body.vital.notes).toBe("Taken after exercise");
    expect(body.vital.updated_by).toBe("admin-1");
  });

  it("returns 404 for non-existent vital", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/nope",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value_primary: 130 }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot update vital reading", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/vital-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ value_primary: 130 }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/patients/:pid/vitals/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedVital(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can soft-delete a vital reading", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/vital-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare("SELECT is_deleted, deleted_by FROM vital_readings WHERE id = ?")
      .bind("vital-1").first<any>();
    expect(row?.is_deleted).toBe(1);
    expect(row?.deleted_by).toBe("admin-1");
  });

  it("returns 404 for non-existent vital", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/nope",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot delete vital reading", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/vital-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/patients/:pid/vitals/import", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("imports valid CSV rows", async () => {
    const csv = `type,measured_at,value_primary,value_secondary,unit
bp,2024-01-01T08:00:00Z,120,80,mmHg
glucose,2024-01-02T08:00:00Z,5.4,,mmol/L`;

    const file = new Blob([csv], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", file, "vitals.csv");

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/import",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.imported).toBe(2);
    expect(body.errors.length).toBe(0);
  });

  it("returns 400 when file is missing", async () => {
    const token = await adminToken();
    const formData = new FormData();
    const res = await app.request(
      "/api/patients/patient-1/vitals/import",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns errors for invalid rows", async () => {
    const csv = `type,measured_at,value_primary,unit
invalid_type,2024-01-01,100,mmHg`;

    const file = new Blob([csv], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", file, "vitals.csv");

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/import",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(207);
    const body = await res.json<any>();
    expect(body.errors.length).toBe(1);
  });

  it("viewer cannot import vitals", async () => {
    const csv = `type,measured_at,value_primary,unit\nbp,2024-01-01,120,mmHg`;
    const file = new Blob([csv], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", file, "vitals.csv");

    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/vitals/import",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}` },
        body: formData,
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});
