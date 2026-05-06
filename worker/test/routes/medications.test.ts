import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedDocument } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

async function seedMedication(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    patient_id: string;
    brand_name: string;
    dosage: string;
    form: string;
    start_date: string;
    is_active: number;
    is_deleted: number;
    document_id: string | null;
    lifecycle_events: string;
    prescription_ids: string;
  }>
) {
  const id = overrides?.id ?? "med-1";
  const patient_id = overrides?.patient_id ?? "patient-1";
  const brand_name = overrides?.brand_name ?? "Metformin";
  const dosage = overrides?.dosage ?? "500mg";
  const form = overrides?.form ?? "tablet";
  const start_date = overrides?.start_date ?? "2024-01-01";
  const is_active = overrides?.is_active ?? 1;
  const is_deleted = overrides?.is_deleted ?? 0;
  const document_id = overrides?.document_id ?? null;
  const lifecycle_events = overrides?.lifecycle_events ?? "[]";
  const prescription_ids = overrides?.prescription_ids ?? "[]";

  await db
    .prepare(
      `INSERT INTO medications (id, patient_id, document_id, brand_name, dosage, form, start_date, is_active, is_deleted, lifecycle_events, prescription_ids, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    )
    .bind(id, patient_id, document_id, brand_name, dosage, form, start_date, is_active, is_deleted, lifecycle_events, prescription_ids)
    .run();
  return id;
}

describe("GET /api/patients/:pid/medications", () => {
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

  it("returns all active medications with schedules", async () => {
    await seedMedication(env.DB, { id: "med-1" });
    await env.DB.prepare(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    )
      .bind("sched-1", "med-1", "morning", "after_meal", 1)
      .run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medications.length).toBe(1);
    expect(body.medications[0].brand_name).toBe("Metformin");
    expect(body.medications[0].schedules.length).toBe(1);
    expect(body.medications[0].schedules[0].time_of_day).toBe("morning");
  });

  it("filters by is_active", async () => {
    await seedMedication(env.DB, { id: "med-1", is_active: 1 });
    await seedMedication(env.DB, { id: "med-2", brand_name: "Aspirin", is_active: 0 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications?is_active=1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medications.length).toBe(1);
    expect(body.medications[0].id).toBe("med-1");
  });

  it("excludes deleted medications", async () => {
    await seedMedication(env.DB, { id: "med-1", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medications.length).toBe(0);
  });

  it("viewer can read medications", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });

  it("filters by document_id when provided", async () => {
    await seedDocument(env.DB, { id: "doc-1" });
    await seedDocument(env.DB, { id: "doc-2" });
    await seedMedication(env.DB, { id: "med-1", document_id: "doc-1", prescription_ids: JSON.stringify(["doc-1"]) });
    await seedMedication(env.DB, { id: "med-2", brand_name: "Atorvastatin", document_id: "doc-2", prescription_ids: JSON.stringify(["doc-2"]) });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications?document_id=doc-1",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medications.length).toBe(1);
    expect(body.medications[0].id).toBe("med-1");
  });
});

describe("POST /api/patients/:pid/medications", () => {
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

  it("admin can create medication with schedules", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: "Metformin",
          dosage: "500mg",
          form: "tablet",
          start_date: "2024-01-01",
          schedules: [
            { time_of_day: "morning", meal_relation: "after_meal", dose_quantity: 1 },
            { time_of_day: "evening", meal_relation: "after_meal", dose_quantity: 1 },
          ],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.medication.brand_name).toBe("Metformin");
    expect(body.medication.schedules.length).toBe(2);
  });

  it("returns 400 for missing required fields", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: "Metformin" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid form", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: "Metformin",
          dosage: "500mg",
          form: "invalid_form",
          start_date: "2024-01-01",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("viewer cannot create medication", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: "Metformin",
          dosage: "500mg",
          form: "tablet",
          start_date: "2024-01-01",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("auto-appends a started lifecycle event and sets prescription_ids", async () => {
    await seedDocument(env.DB, { id: "doc-rx-lifecycle" });

    const token = await adminToken();
    const res = await app.request("/api/patients/patient-1/medications", {
      method: "POST",
      headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_name: "Metformin",
        dosage: "500mg",
        form: "tablet",
        start_date: "2026-04-20",
        prescription_ids: ["doc-rx-lifecycle"],
      }),
    }, TEST_ENV);
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.medication.lifecycle_events).toHaveLength(1);
    expect(body.medication.lifecycle_events[0].event).toBe("started");
    expect(body.medication.lifecycle_events[0].date).toBe("2026-04-20");
    expect(body.medication.lifecycle_events[0].document_id).toBe("doc-rx-lifecycle");
    expect(body.medication.prescription_ids).toEqual(["doc-rx-lifecycle"]);
  });

  it("stores days_of_week and dose_quantity as text on schedule", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_name: "Metformin",
          dosage: "500mg",
          form: "tablet",
          start_date: "2024-01-01",
          schedules: [
            {
              time_of_day: "morning",
              meal_relation: "after_meal",
              dose_quantity: "1 tablet",
              days_of_week: "monday,tuesday,wednesday,thursday,friday",
            },
            {
              time_of_day: "morning",
              meal_relation: "after_meal",
              dose_quantity: "half tablet",
              days_of_week: "saturday,sunday",
            },
          ],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.medication.schedules).toHaveLength(2);
    expect(body.medication.schedules[0].dose_quantity).toBe("1 tablet");
    expect(body.medication.schedules[0].days_of_week).toBe("monday,tuesday,wednesday,thursday,friday");
    expect(body.medication.schedules[1].dose_quantity).toBe("half tablet");
    expect(body.medication.schedules[1].days_of_week).toBe("saturday,sunday");
  });
});

describe("PUT /api/patients/:pid/medications/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedMedication(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can update medication and add schedules", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          dosage: "1000mg",
          schedules: [
            { time_of_day: "morning", meal_relation: "after_meal", dose_quantity: 2 },
          ],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.dosage).toBe("1000mg");
    expect(body.medication.schedules.length).toBe(1);
  });

  it("returns 404 for non-existent medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/nope",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dosage: "200mg" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot update medication", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dosage: "200mg" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("soft-deletes omitted schedule rows on PUT", async () => {
    await env.DB.prepare(
      `INSERT INTO medication_schedules
       (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    ).bind("sched-keep", "med-1", "morning", "after_meal", "1 tablet").run();

    await env.DB.prepare(
      `INSERT INTO medication_schedules
       (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    ).bind("sched-drop", "med-1", "evening", "after_meal", "1 tablet").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: [
            { id: "sched-keep", time_of_day: "morning", meal_relation: "after_meal", dose_quantity: "1 tablet" },
          ],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.schedules).toHaveLength(1);
    expect(body.medication.schedules[0].id).toBe("sched-keep");

    const dropped = await env.DB.prepare(
      "SELECT is_deleted FROM medication_schedules WHERE id = ?"
    ).bind("sched-drop").first<{ is_deleted: number }>();
    expect(dropped?.is_deleted).toBe(1);
  });

  it("soft-deletes all rows when schedules is empty array", async () => {
    await env.DB.prepare(
      `INSERT INTO medication_schedules
       (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    ).bind("sched-1", "med-1", "morning", "after_meal", "1 tablet").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ schedules: [] }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.schedules).toHaveLength(0);
  });

  it("soft-deletes existing rows when all submitted schedules are new inserts", async () => {
    await env.DB.prepare(
      `INSERT INTO medication_schedules
       (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    ).bind("old-sched", "med-1", "morning", "after_meal", "1 tablet").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          schedules: [
            { time_of_day: "evening", meal_relation: "after_meal", dose_quantity: "2 tablets" },
          ],
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.schedules).toHaveLength(1);
    expect(body.medication.schedules[0].time_of_day).toBe("evening");

    const old = await env.DB.prepare(
      "SELECT is_deleted FROM medication_schedules WHERE id = ?"
    ).bind("old-sched").first<{ is_deleted: number }>();
    expect(old?.is_deleted).toBe(1);
  });

  it("appends dosage_changed event when dosage is updated", async () => {
    const medId = await seedMedication(env.DB, {
      id: "med-dosage-change",
      dosage: "5mg",
      lifecycle_events: JSON.stringify([{ event: "started", date: "2026-01-01" }]),
    });

    const token = await adminToken();
    const res = await app.request(`/api/patients/patient-1/medications/${medId}`, {
      method: "PUT",
      headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ dosage: "10mg" }),
    }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.dosage).toBe("10mg");
    expect(body.medication.lifecycle_events).toHaveLength(2);
    const changeEvent = body.medication.lifecycle_events[1];
    expect(changeEvent.event).toBe("dosage_changed");
    expect(changeEvent.old_value).toBe("5mg");
    expect(changeEvent.new_value).toBe("10mg");
  });

  it("leaves existing schedules untouched when schedules key is absent from PUT body", async () => {
    await env.DB.prepare(
      `INSERT INTO medication_schedules
       (id, medication_id, time_of_day, meal_relation, dose_quantity, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, 'admin-1', 'admin-1')`
    ).bind("untouched", "med-1", "morning", "after_meal", "1 tablet").run();

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dosage: "1000mg" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.schedules).toHaveLength(1);
  });
});

describe("GET /api/patients/:pid/medications/:id", () => {
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

  it("returns a single medication with schedules and lifecycle_events", async () => {
    const medId = await seedMedication(env.DB, {
      lifecycle_events: JSON.stringify([{ event: "started", date: "2026-01-01" }]),
      prescription_ids: JSON.stringify(["doc-1"]),
    });
    await env.DB.prepare(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation, created_by, updated_by)
       VALUES ('sched-1', ?, 'morning', 'after_meal', 'admin-1', 'admin-1')`
    ).bind(medId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/medications/${medId}`,
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.id).toBe(medId);
    expect(body.medication.schedules).toHaveLength(1);
    expect(body.medication.lifecycle_events).toHaveLength(1);
    expect(body.medication.prescription_ids).toEqual(["doc-1"]);
  });

  it("returns 404 for non-existent medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/nonexistent",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 for soft-deleted medication", async () => {
    await seedMedication(env.DB, { id: "med-deleted" });
    await env.DB.prepare("UPDATE medications SET is_deleted = 1 WHERE id = 'med-deleted'").run();
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-deleted",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/patients/:pid/medications/:id", () => {
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

  it("soft-deletes the medication and its schedules", async () => {
    const medId = await seedMedication(env.DB, { id: "med-del-test" });
    await env.DB.prepare(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation, created_by, updated_by)
       VALUES ('sched-del', ?, 'morning', 'after_meal', 'admin-1', 'admin-1')`
    ).bind(medId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/medications/${medId}`,
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(204);

    const med = await env.DB.prepare("SELECT is_deleted FROM medications WHERE id = ?").bind(medId).first<{ is_deleted: number }>();
    expect(med!.is_deleted).toBe(1);
    const sched = await env.DB.prepare("SELECT is_deleted FROM medication_schedules WHERE id = 'sched-del'").first<{ is_deleted: number }>();
    expect(sched!.is_deleted).toBe(1);
  });

  it("returns 404 for non-existent medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/nonexistent",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for viewer", async () => {
    await seedMedication(env.DB, { id: "med-viewer-del" });
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-viewer-del",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/patients/:pid/medications/:id/discontinue", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedMedication(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    )
      .bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1")
      .run();
  });

  it("admin can discontinue a medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1/discontinue",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ end_date: "2024-06-30" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.is_active).toBe(0);
    expect(body.medication.end_date).toBe("2024-06-30");
  });

  it("sets is_active=0, appends stopped event, and returns full medication with schedules", async () => {
    const medId = await seedMedication(env.DB, {
      id: "med-disc",
      lifecycle_events: JSON.stringify([{ event: "started", date: "2026-01-01" }]),
    });
    await env.DB.prepare(
      `INSERT INTO medication_schedules (id, medication_id, time_of_day, meal_relation, created_by, updated_by)
       VALUES ('sched-disc', ?, 'morning', 'after_meal', 'admin-1', 'admin-1')`
    ).bind(medId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/medications/${medId}/discontinue`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Caused dizziness" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.is_active).toBe(0);
    expect(body.medication.end_date).toBeTruthy();
    expect(body.medication.schedules).toHaveLength(1);
    expect(body.medication.lifecycle_events).toHaveLength(2);
    const stoppedEvent = body.medication.lifecycle_events[1];
    expect(stoppedEvent.event).toBe("stopped");
    expect(stoppedEvent.note).toBe("Caused dizziness");
  });

  it("returns 404 for non-existent medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/nope/discontinue",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("viewer cannot discontinue medication", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-1/discontinue",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/patients/:pid/medications/:id/restart", () => {
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

  it("sets is_active=1, clears end_date, appends restarted event", async () => {
    const medId = await seedMedication(env.DB, {
      id: "med-restart",
      is_active: 0,
      lifecycle_events: JSON.stringify([
        { event: "started", date: "2026-01-01" },
        { event: "stopped", date: "2026-03-01", note: "Side effects" },
      ]),
    });
    await env.DB.prepare("UPDATE medications SET end_date = '2026-03-01' WHERE id = ?").bind(medId).run();

    const token = await adminToken();
    const res = await app.request(
      `/api/patients/patient-1/medications/${medId}/restart`,
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Lower dose per Dr. Patel", document_id: "doc-new" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.medication.is_active).toBe(1);
    expect(body.medication.end_date).toBeNull();
    expect(body.medication.lifecycle_events).toHaveLength(3);
    const restartEvent = body.medication.lifecycle_events[2];
    expect(restartEvent.event).toBe("restarted");
    expect(restartEvent.note).toBe("Lower dose per Dr. Patel");
    expect(restartEvent.document_id).toBe("doc-new");
    expect(body.medication.prescription_ids).toContain("doc-new");
  });

  it("returns 404 for non-existent medication", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/nonexistent/restart",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for viewer", async () => {
    await seedMedication(env.DB, { id: "med-restart-v", is_active: 0 });
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/medications/med-restart-v/restart",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});
