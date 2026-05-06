import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb, seedAdmin, seedPatient, seedDocument } from "../helpers/setup-db";

describe("migration 0005 — test_results unique index", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB, { document_date: "2026-03-15" });
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes','admin-1','admin-1')`,
    ).run();
  });

  it("allows first INSERT", async () => {
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-sodium','doc-1','2026-03-15', 140, 'NORMAL', 'admin-1','admin-1')`,
    ).run();
    const row = await env.DB.prepare("SELECT * FROM test_results WHERE id='tr-1'").first();
    expect(row).toBeTruthy();
  });

  it("INSERT OR IGNORE silently skips duplicate (test_def_id, document_id, date)", async () => {
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-sodium','doc-1','2026-03-15', 140, 'NORMAL', 'admin-1','admin-1')`,
    ).run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-2','patient-1','td-sodium','doc-1','2026-03-15', 140, 'NORMAL', 'admin-1','admin-1')`,
    ).run();
    const { results } = await env.DB.prepare(
      "SELECT id FROM test_results WHERE test_def_id='td-sodium' AND document_id='doc-1'",
    ).all();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("tr-1");
  });

  it("allows same test on different dates", async () => {
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-1','patient-1','td-sodium','doc-1','2026-03-15', 140, 'NORMAL', 'admin-1','admin-1')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO test_results (id, patient_id, test_def_id, document_id, date, value, flag, created_by, updated_by)
       VALUES ('tr-2','patient-1','td-sodium','doc-1','2026-04-15', 142, 'NORMAL', 'admin-1','admin-1')`,
    ).run();
    const { results } = await env.DB.prepare(
      "SELECT id FROM test_results WHERE test_def_id='td-sodium'",
    ).all();
    expect(results.length).toBe(2);
  });
});
