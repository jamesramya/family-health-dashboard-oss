import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb } from "../helpers/setup-db";

describe("Database schema", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("creates all 17 expected tables", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all();
    const tables = results.map((r) => r.name as string);
    const expected = [
      "clinical_notes", "documents", "medication_schedules", "medications",
      "oauth_auth_codes", "oauth_clients", "oauth_refresh_tokens",
      "patient", "purge_log", "refresh_tokens", "scan_findings", "system_settings",
      "test_definitions", "test_results", "user_patient_access", "users",
      "vital_readings",
    ];
    for (const t of expected) expect(tables).toContain(t);
  });

  it("personal_access_tokens has issued_via and client_id columns (migration 0019)", async () => {
    const { results } = await env.DB.prepare("PRAGMA table_info(personal_access_tokens)").all<{ name: string }>();
    const cols = results.map((r) => r.name);
    expect(cols).toContain("issued_via");
    expect(cols).toContain("client_id");
  });

  it("enforces unique email on users", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u1', 'a@b.com', 'h', 'admin', 'A')"
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u2', 'a@b.com', 'h', 'viewer', 'B')"
      ).run()
    ).rejects.toThrow();
  });

  it("rejects invalid role", async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u1', 'x@b.com', 'h', 'hacker', 'X')"
      ).run()
    ).rejects.toThrow();
  });

  it("enforces unique canonical_name on test_definitions", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u1', 'a@b.com', 'h', 'admin', 'A')"
    ).run();
    await env.DB.prepare(
      "INSERT INTO test_definitions (id, canonical_name, label, category, created_by, updated_by) VALUES ('t1', 'hgb', 'Hgb', 'haematology', 'u1', 'u1')"
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO test_definitions (id, canonical_name, label, category, created_by, updated_by) VALUES ('t2', 'hgb', 'Hgb2', 'haematology', 'u1', 'u1')"
      ).run()
    ).rejects.toThrow();
  });

  it("enforces unique user+patient access", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u1', 'a@b.com', 'h', 'admin', 'A')"
    ).run();
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES ('p1', 'P', '2000-01-01', 'M', 'u1', 'u1')"
    ).run();
    await env.DB.prepare(
      "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES ('a1', 'u1', 'p1', 'admin', 'u1')"
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO user_patient_access (id, user_id, patient_id, role, granted_by) VALUES ('a2', 'u1', 'p1', 'viewer', 'u1')"
      ).run()
    ).rejects.toThrow();
  });

  it("stores workflow_instance_id on documents", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, email, password_hash, role, display_name) VALUES ('u1', 'a@b.com', 'h', 'admin', 'A')"
    ).run();
    await env.DB.prepare(
      "INSERT INTO patient (id, name, date_of_birth, gender, created_by, updated_by) VALUES ('p1', 'P', '2000-01-01', 'M', 'u1', 'u1')"
    ).run();
    await env.DB.prepare(
      `INSERT INTO documents (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes, workflow_instance_id, uploaded_by, created_by, updated_by)
       VALUES ('d1', 'p1', 'blood_report', 'test.pdf', '2026-01-01', 'key', 'application/pdf', 1024, 'wf-abc-123', 'u1', 'u1', 'u1')`
    ).run();
    const doc = await env.DB.prepare("SELECT workflow_instance_id FROM documents WHERE id = 'd1'").first();
    expect(doc!.workflow_instance_id).toBe("wf-abc-123");
  });
});
