import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { handleScheduled } from "../src/scheduled";
import { setupDb, seedAdmin, seedPatient } from "./helpers/setup-db";

const TEST_ENV = { ...env };

// Helper: create a fake ScheduledEvent and ExecutionContext
function makeEvent(): ScheduledEvent {
  return { scheduledTime: Date.now(), cron: "0 3 * * *", noRetry: () => {} } as any;
}

function makeCtx(): ExecutionContext {
  return { waitUntil: (_p: Promise<any>) => {}, passThroughOnException: () => {} } as any;
}

async function seedDocument(db: D1Database, id: string, patientId: string, r2Key: string, deletedAt?: string) {
  await db
    .prepare(
      `INSERT INTO documents
        (id, patient_id, type, title, document_date, r2_key, mime_type, file_size_bytes,
         processing_status, uploaded_by, created_by, updated_by,
         is_deleted, deleted_at, deleted_by)
       VALUES (?, ?, 'blood_report', 'Report', '2024-01-01', ?, 'application/pdf', 1000, 'complete',
               'admin-1', 'admin-1', 'admin-1', ?, ?, 'admin-1')`
    )
    .bind(
      id,
      patientId,
      r2Key,
      deletedAt ? 1 : 0,
      deletedAt ?? null
    )
    .run();
}

async function seedVital(db: D1Database, id: string, patientId: string, deletedAt?: string) {
  await db
    .prepare(
      `INSERT INTO vital_readings
        (id, patient_id, type, measured_at, value_primary, unit, source,
         created_by, updated_by, is_deleted, deleted_at, deleted_by)
       VALUES (?, ?, 'bp', '2024-01-01T08:00:00Z', 120, 'mmHg', 'manual',
               'admin-1', 'admin-1', ?, ?, 'admin-1')`
    )
    .bind(id, patientId, deletedAt ? 1 : 0, deletedAt ?? null)
    .run();
}

describe("handleScheduled (purge cron)", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("does NOT purge records soft-deleted less than 30 days ago", async () => {
    // Deleted 1 day ago — should NOT be purged
    const recentDeletedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    await seedVital(env.DB, "vital-recent", "patient-1", recentDeletedAt);

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT id FROM vital_readings WHERE id = ?")
      .bind("vital-recent").first();
    expect(row).not.toBeNull(); // Should still exist
  });

  it("DOES hard-delete records soft-deleted more than 30 days ago", async () => {
    // Deleted 31 days ago — should BE purged
    const oldDeletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await seedVital(env.DB, "vital-old", "patient-1", oldDeletedAt);

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT id FROM vital_readings WHERE id = ?")
      .bind("vital-old").first();
    expect(row).toBeNull(); // Should be gone
  });

  it("deletes R2 objects for purged documents", async () => {
    const oldDeletedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const r2Key = "patients/patient-1/documents/doc-old/report.pdf";

    await seedDocument(env.DB, "doc-old", "patient-1", r2Key, oldDeletedAt);

    // Put a mock object in R2
    await env.BUCKET.put(r2Key, "fake content");

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    // Document should be gone from DB
    const row = await env.DB.prepare("SELECT id FROM documents WHERE id = ?")
      .bind("doc-old").first();
    expect(row).toBeNull();

    // R2 object should be deleted
    const r2Obj = await env.BUCKET.get(r2Key);
    expect(r2Obj).toBeNull();
  });

  it("inserts a purge_log entry after each run", async () => {
    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const logRow = await env.DB.prepare("SELECT * FROM purge_log ORDER BY purged_at DESC LIMIT 1")
      .first<any>();
    expect(logRow).not.toBeNull();
    expect(typeof logRow.total_rows).toBe("number");
    expect(logRow.r2_objects_deleted).toBeGreaterThanOrEqual(0);
  });

  it("does not purge active (non-deleted) records", async () => {
    // Active vital — not deleted
    await seedVital(env.DB, "vital-active", "patient-1");

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT id FROM vital_readings WHERE id = ?")
      .bind("vital-active").first();
    expect(row).not.toBeNull();
  });
});

describe("handleScheduled (OAuth sweep)", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("deletes expired oauth_auth_codes", async () => {
    await env.DB.prepare(
      "INSERT INTO oauth_clients (id, client_name, redirect_uris, scope) VALUES (?, ?, ?, ?)"
    ).bind("client-sweep", "Sweep Client", '["https://example.com/cb"]', "mcp.read").run();
    await env.DB.prepare(
      `INSERT INTO oauth_auth_codes
        (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))`
    ).bind("expired-code", "client-sweep", "admin-1", "https://example.com/cb", "challenge", "mcp.read", "https://example.com").run();

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT code_hash FROM oauth_auth_codes WHERE code_hash = ?")
      .bind("expired-code").first();
    expect(row).toBeNull();
  });

  it("does NOT delete non-expired oauth_auth_codes", async () => {
    await env.DB.prepare(
      "INSERT INTO oauth_clients (id, client_name, redirect_uris, scope) VALUES (?, ?, ?, ?)"
    ).bind("client-sweep2", "Sweep Client 2", '["https://example.com/cb"]', "mcp.read").run();
    await env.DB.prepare(
      `INSERT INTO oauth_auth_codes
        (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+10 minutes'))`
    ).bind("fresh-code", "client-sweep2", "admin-1", "https://example.com/cb", "challenge", "mcp.read", "https://example.com").run();

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT code_hash FROM oauth_auth_codes WHERE code_hash = ?")
      .bind("fresh-code").first();
    expect(row).not.toBeNull();
  });

  it("deletes oauth_refresh_tokens expired more than 7 days ago", async () => {
    await env.DB.prepare(
      "INSERT INTO oauth_clients (id, client_name, redirect_uris, scope) VALUES (?, ?, ?, ?)"
    ).bind("client-rt-sweep", "RT Sweep Client", '["https://example.com/cb"]', "mcp.read").run();
    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
        (id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, issued_via, client_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("pat-rt-sweep", "admin-1", "RT Sweep PAT", "hash-rt-sweep", "fhd_abc", "xyz", "mcp.read", "anthropic", new Date().toISOString(), "oauth", "client-rt-sweep").run();

    await env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
        (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-8 days'))`
    ).bind("rt-old", "rthash-old", "pat-rt-sweep", "client-rt-sweep", "admin-1", "mcp.read", "https://example.com").run();

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT id FROM oauth_refresh_tokens WHERE id = ?")
      .bind("rt-old").first();
    expect(row).toBeNull();
  });

  it("does NOT delete oauth_refresh_tokens expired less than 7 days ago", async () => {
    await env.DB.prepare(
      "INSERT INTO oauth_clients (id, client_name, redirect_uris, scope) VALUES (?, ?, ?, ?)"
    ).bind("client-rt-keep", "RT Keep Client", '["https://example.com/cb"]', "mcp.read").run();
    await env.DB.prepare(
      `INSERT INTO personal_access_tokens
        (id, user_id, name, token_hash, token_prefix, token_suffix, scopes, target_platform, pat_consent_acknowledged_at, issued_via, client_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind("pat-rt-keep", "admin-1", "RT Keep PAT", "hash-rt-keep", "fhd_def", "uvw", "mcp.read", "anthropic", new Date().toISOString(), "oauth", "client-rt-keep").run();

    await env.DB.prepare(
      `INSERT INTO oauth_refresh_tokens
        (id, token_hash, access_token_id, client_id, user_id, scope, resource, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '-3 days'))`
    ).bind("rt-recent", "rthash-recent", "pat-rt-keep", "client-rt-keep", "admin-1", "mcp.read", "https://example.com").run();

    await handleScheduled(makeEvent(), TEST_ENV as any, makeCtx());

    const row = await env.DB.prepare("SELECT id FROM oauth_refresh_tokens WHERE id = ?")
      .bind("rt-recent").first();
    expect(row).not.toBeNull();
  });
});
