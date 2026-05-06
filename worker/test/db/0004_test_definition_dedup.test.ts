import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb } from "../helpers/setup-db";

describe("Migration 0004: test_definition dedup", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("test_definitions has canonical_key column with UNIQUE index", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(test_definitions)"
    ).all<{ name: string }>();
    const keyCol = results.find((c) => c.name === "canonical_key");
    expect(keyCol).toBeDefined();

    // Verify uniqueness via index (ALTER TABLE can't add inline UNIQUE, so we use CREATE UNIQUE INDEX)
    const { results: indexes } = await env.DB.prepare(
      "PRAGMA index_list(test_definitions)"
    ).all<{ name: string; unique: number }>();
    const canonicalKeyIdx = indexes.find(
      (i) => i.name === "idx_test_definitions_canonical_key"
    );
    expect(canonicalKeyIdx).toBeDefined();
    expect(canonicalKeyIdx!.unique).toBe(1);
  });

  it("test_definitions.canonical_name retains UNIQUE constraint (ALTER TABLE limitation)", async () => {
    // With ALTER TABLE ADD COLUMN approach, the inline UNIQUE on canonical_name cannot be dropped.
    // The merger code handles this via stage-1 canonical_name fallback.
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, display_name)
       VALUES ('u1','u@x.com','h','admin','U')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO test_definitions
         (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('t1','sodium','Sodium','Sodium','mmol/L','electrolytes','u1','u1')`
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO test_definitions
           (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
         VALUES ('t2','sodium_serum','Sodium','Sodium','mmol/L','electrolytes','u1','u1')`
      ).run()
    ).rejects.toThrow();
  });

  it("test_definitions.canonical_key is UNIQUE", async () => {
    await env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, role, display_name)
       VALUES ('u1','u@x.com','h','admin','U')`
    ).run();
    await env.DB.prepare(
      `INSERT INTO test_definitions
         (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('t1','sodium','Sodium','Sodium','mmol/L','electrolytes','u1','u1')`
    ).run();
    await expect(
      env.DB.prepare(
        `INSERT INTO test_definitions
           (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
         VALUES ('t2','sodium','Sodium2','Sodium2','mmol/L','electrolytes','u1','u1')`
      ).run()
    ).rejects.toThrow();
  });

  it("test_definitions has needs_review and ref_note", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(test_definitions)"
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    expect(names).toContain("needs_review");
    expect(names).toContain("ref_note");
  });

  it("test_definitions has soft-delete columns", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(test_definitions)"
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    expect(names).toContain("is_deleted");
    expect(names).toContain("deleted_at");
    expect(names).toContain("deleted_by");
  });

  it("test_results has ref_low_at_test and ref_high_at_test", async () => {
    const { results } = await env.DB.prepare(
      "PRAGMA table_info(test_results)"
    ).all<{ name: string }>();
    const names = results.map((r) => r.name);
    expect(names).toContain("ref_low_at_test");
    expect(names).toContain("ref_high_at_test");
  });

  it("disambiguation_log table exists", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='disambiguation_log'"
    ).all();
    expect(results.length).toBe(1);
  });
});
