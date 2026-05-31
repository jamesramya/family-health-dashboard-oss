import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb, seedAdmin } from "../helpers/setup-db";

describe("0011_share_links migration", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("share_links table exists with required columns", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='share_links'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("share_links");
  });

  it("share_links can be inserted and selected", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-1', 'abc123hash', '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(expiresAt).run();

    const row = await env.DB.prepare(
      "SELECT id, token_hash, patient_ids, scopes, created_by, revoked_at FROM share_links WHERE id = 'sl-1'"
    ).first<{
      id: string;
      token_hash: string;
      patient_ids: string;
      scopes: string;
      created_by: string;
      revoked_at: string | null;
    }>();

    expect(row?.id).toBe("sl-1");
    expect(row?.token_hash).toBe("abc123hash");
    expect(row?.patient_ids).toBe('["patient-1"]');
    expect(row?.scopes).toBe('["read"]');
    expect(row?.created_by).toBe("admin-1");
    expect(row?.revoked_at).toBeNull();
  });

  it("token_hash is unique", async () => {
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, expires_at, created_by)
       VALUES ('sl-1', 'samehash', '[]', ?, 'admin-1')`
    ).bind(expiresAt).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO share_links (id, token_hash, patient_ids, expires_at, created_by)
         VALUES ('sl-2', 'samehash', '[]', ?, 'admin-1')`
      ).bind(expiresAt).run()
    ).rejects.toThrow();
  });

  it("idx_share_links_token index exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_share_links_token'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("idx_share_links_token");
  });
});
