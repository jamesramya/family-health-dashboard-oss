import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient, seedDocument } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function superAdminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function regularAdminToken(id = "admin-2", email = "admin2@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

describe("GET /api/admin/users", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB); // is_super_admin=1
    await seedViewer(env.DB);
  });

  it("super admin can list all users", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.users.length).toBe(2);
  });

  it("non-super admin returns 403", async () => {
    // Seed a regular admin (is_super_admin=0)
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();

    const token = await regularAdminToken();
    const res = await app.request(
      "/api/admin/users",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("viewer returns 403", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/admin/users",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/admin/users", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/users", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("creates user with must_change_pw=1 and hashed temp password", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "newuser@test.com",
          display_name: "New User",
          role: "viewer",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.user.must_change_pw).toBe(1);
    expect(body.temp_password).toBeTruthy();
    expect(typeof body.temp_password).toBe("string");

    // Verify in DB
    const row = await env.DB.prepare("SELECT must_change_pw, password_hash FROM users WHERE email = ?")
      .bind("newuser@test.com").first<any>();
    expect(row?.must_change_pw).toBe(1);
    expect(row?.password_hash).not.toBe(body.temp_password); // Should be hashed
  });

  it("validates required fields", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newuser@test.com" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    const token = await superAdminToken();
    // admin@test.com already exists from seedAdmin
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@test.com",
          display_name: "Another Admin",
          role: "admin",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(409);
  });

  it("non-super admin returns 403", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();

    const token = await regularAdminToken();
    const res = await app.request(
      "/api/admin/users",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "x@test.com", display_name: "X", role: "viewer" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/admin/users/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin can delete a user", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users/viewer-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);

    const row = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
      .bind("viewer-1").first();
    expect(row).toBeNull();
  });

  it("returns 404 for non-existent user", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users/nonexistent",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("non-super admin returns 403", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();

    const token = await regularAdminToken();
    const res = await app.request(
      "/api/admin/users/viewer-1",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/users/:id/reset-pw", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("returns temp password once and sets must_change_pw=1", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users/viewer-1/reset-pw",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.temp_password).toBeTruthy();
    expect(body.must_change_pw).toBe(1);

    // Verify in DB
    const row = await env.DB.prepare("SELECT must_change_pw FROM users WHERE id = ?")
      .bind("viewer-1").first<any>();
    expect(row?.must_change_pw).toBe(1);
  });

  it("returns 404 for non-existent user", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/users/nope/reset-pw",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("non-super admin returns 403", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();

    const token = await regularAdminToken();
    const res = await app.request(
      "/api/admin/users/viewer-1/reset-pw",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/documents/backfill-sha256", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("computes and stores sha256 for documents without one", async () => {
    const token = await superAdminToken();

    await seedDocument(env.DB, { id: "doc-1", sha256: null });
    const fileBytes = new TextEncoder().encode("test PDF content");
    await env.BUCKET.put("patients/patient-1/documents/doc-1/report.pdf", fileBytes);

    const res = await app.request(
      "/api/admin/documents/backfill-sha256",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.updated).toBe(1);
    expect(body.skipped).toBe(0);

    const row = await env.DB.prepare("SELECT sha256 FROM documents WHERE id = 'doc-1'").first<any>();
    expect(row?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("skips documents whose R2 object is missing", async () => {
    const token = await superAdminToken();

    await seedDocument(env.DB, { id: "doc-missing", sha256: null, r2_key: "missing/key.pdf" });

    const res = await app.request(
      "/api/admin/documents/backfill-sha256",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(1);
  });

  it("does not touch already-hashed documents", async () => {
    const token = await superAdminToken();

    await seedDocument(env.DB, { id: "doc-hashed", sha256: "a".repeat(64) });

    const res = await app.request(
      "/api/admin/documents/backfill-sha256",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.updated).toBe(0);
    expect(body.skipped).toBe(0);
  });

  it("returns 403 for non-super-admin", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, ?, ?, 0)"
    ).bind("admin-2", "admin2@test.com", "fakehash", "admin", "Regular Admin").run();

    const token = await regularAdminToken();

    const res = await app.request(
      "/api/admin/documents/backfill-sha256",
      { method: "POST", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/export", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("succeeds with valid X-API-Key header (SHA-256 checked)", async () => {
    const apiKey = "my-secret-export-key";
    const keyHash = await sha256hex(apiKey);
    await env.DB.prepare(
      "INSERT INTO system_settings (key, value) VALUES ('backup_api_key_hash', ?)"
    ).bind(keyHash).run();

    const res = await app.request(
      "/api/admin/export",
      { headers: { "x-api-key": apiKey } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.tables).toBeDefined();
    expect(body.exported_at).toBeTruthy();
    expect(Array.isArray(body.tables.users)).toBe(true);
  });

  it("returns 401 for invalid API key", async () => {
    await env.DB.prepare(
      "INSERT INTO system_settings (key, value) VALUES ('backup_api_key_hash', 'not-the-right-hash')"
    ).bind().run();

    const res = await app.request(
      "/api/admin/export",
      { headers: { "x-api-key": "wrong-key" } },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("succeeds with valid JWT cookie (super admin only)", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/export",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.tables).toBeDefined();
    expect(body.exported_at).toBeTruthy();
  });

  it("returns 401 without any auth", async () => {
    const res = await app.request("/api/admin/export", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });

  it("returns all tables in export with exported_at timestamp", async () => {
    const token = await superAdminToken();
    const res = await app.request(
      "/api/admin/export",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.tables.users).toBeDefined();
    expect(body.tables.patient).toBeDefined();
    expect(body.tables.vital_readings).toBeDefined();
    expect(body.tables.medications).toBeDefined();
    expect(body.tables.clinical_notes).toBeDefined();
    expect(body.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});
