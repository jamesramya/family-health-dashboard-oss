import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken() {
  return createAccessToken({ sub: "admin-1", role: "admin", email: "admin@test.com" }, JWT_SECRET);
}

async function viewerToken() {
  return createAccessToken({ sub: "viewer-1", role: "viewer", email: "viewer@test.com" }, JWT_SECRET);
}

async function seedCultureDoc(db: D1Database, id = "doc-c") {
  await db.prepare(
    `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key,
       mime_type, file_size_bytes, processing_status, uploaded_by, created_by, updated_by)
     VALUES (?, 'patient-1', 'culture_report', 'Sputum Culture', '2026-04-01',
       'patients/patient-1/documents/${id}/file.pdf', 'application/pdf', 1234,
       'complete', 'admin-1', 'admin-1', 'admin-1')`
  ).bind(id).run();
}

async function seedCulture(
  db: D1Database,
  overrides?: Partial<{
    id: string;
    document_id: string;
    specimen_type: string;
    result_status: string;
    organism: string | null;
    collection_date: string | null;
    is_deleted: number;
  }>
) {
  const id = overrides?.id ?? "cr-1";
  const document_id = overrides?.document_id ?? "doc-c";
  const specimen_type = overrides?.specimen_type ?? "sputum";
  const result_status = overrides?.result_status ?? "positive";
  const organism = overrides?.organism ?? "Klebsiella pneumoniae";
  const collection_date = overrides?.collection_date ?? "2026-04-01";
  const is_deleted = overrides?.is_deleted ?? 0;

  await db.prepare(
    `INSERT INTO culture_results
       (id, document_id, patient_id, specimen_type, collection_date, result_status,
        organism, sensitivities, created_by, updated_by, is_deleted)
     VALUES (?, ?, 'patient-1', ?, ?, ?, ?, '[]', 'admin-1', 'admin-1', ?)`
  ).bind(id, document_id, specimen_type, collection_date, result_status, organism, is_deleted).run();
  return id;
}

describe("GET /api/patients/:pid/cultures", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedCultureDoc(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
  });

  it("returns cultures sorted by collection_date desc", async () => {
    await seedCultureDoc(env.DB, "doc-c2");
    await seedCulture(env.DB, { id: "cr-1", document_id: "doc-c", collection_date: "2026-01-01" });
    await seedCulture(env.DB, { id: "cr-2", document_id: "doc-c2", collection_date: "2026-04-01" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ cultures: { id: string }[] }>();
    expect(body.cultures.length).toBe(2);
    expect(body.cultures[0].id).toBe("cr-2");
  });

  it("excludes soft-deleted cultures", async () => {
    await seedCulture(env.DB, { id: "cr-1", is_deleted: 0 });
    await seedCulture(env.DB, { id: "cr-2", is_deleted: 1 });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ cultures: { id: string }[] }>();
    expect(body.cultures.length).toBe(1);
  });

  it("filters by document_id when provided", async () => {
    await seedCultureDoc(env.DB, "doc-c2");
    await seedCulture(env.DB, { id: "cr-1", document_id: "doc-c" });
    await seedCulture(env.DB, { id: "cr-2", document_id: "doc-c2" });

    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures?document_id=doc-c",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ cultures: { id: string }[] }>();
    expect(body.cultures.length).toBe(1);
    expect(body.cultures[0].id).toBe("cr-1");
  });

  it("viewer can read cultures", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/patients/:pid/cultures/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
    await seedCultureDoc(env.DB);
    await seedCulture(env.DB);
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES (?, ?, ?, ?, ?)"
    ).bind("acc-v1", "viewer-1", "patient-1", "viewer", "admin-1").run();
  });

  it("admin can soft-delete a culture result", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures/cr-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare(
      "SELECT is_deleted, deleted_at, deleted_by FROM culture_results WHERE id = 'cr-1'"
    ).first<{ is_deleted: number; deleted_at: string; deleted_by: string }>();
    expect(row?.is_deleted).toBe(1);
    expect(row?.deleted_at).toBeTruthy();
    expect(row?.deleted_by).toBe("admin-1");
  });

  it("viewer cannot delete culture result", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures/cr-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent culture", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/patients/patient-1/cultures/nope",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });
});
