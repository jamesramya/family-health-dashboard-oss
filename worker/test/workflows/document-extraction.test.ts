import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setupDb, seedAdmin, seedPatient, seedDocument } from "../helpers/setup-db";
import { persistExtractedTests, persistCultureResult, resolveTestDefinitions } from "../../src/workflows/document-extraction";
import type { CultureReportExtraction } from "../../src/services/extractor";

afterEach(() => vi.restoreAllMocks());

describe("persistExtractedTests", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("uses document.document_date when report_date missing", async () => {
    await seedDocument(env.DB, { document_date: "2026-03-15" });
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes','admin-1','admin-1')`,
    ).run();
    // resolvedTestDefs is pre-computed by the resolve-test-definitions Workflow step
    await persistExtractedTests(env.DB, {
      tests: [{ raw_name: "Sodium", canonical_name: "Sodium", key: "sodium",
                value: 140, unit: "mmol/L", category: "electrolytes", flag: "NORMAL" }],
      report_date: undefined, lab_name: "Test Lab",
    } as any, "patient-1", "doc-1", "admin-1", { 0: "td-sodium" });
    const row = await env.DB.prepare("SELECT date FROM test_results WHERE document_id='doc-1'").first<{ date: string }>();
    expect(row!.date).toBe("2026-03-15");
  });

  it("populates ref_low_at_test / ref_high_at_test from extraction", async () => {
    await seedDocument(env.DB, { document_date: "2026-03-15" });
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes','admin-1','admin-1')`,
    ).run();
    await persistExtractedTests(env.DB, {
      tests: [{ raw_name: "Sodium", canonical_name: "Sodium", key: "sodium",
                value: 140, unit: "mmol/L", category: "electrolytes", flag: "NORMAL",
                ref_low: 136, ref_high: 146 }],
      report_date: "2026-03-15", lab_name: "Test Lab",
    } as any, "patient-1", "doc-1", "admin-1", { 0: "td-sodium" });
    const row = await env.DB.prepare(
      "SELECT ref_low_at_test, ref_high_at_test FROM test_results WHERE document_id='doc-1'",
    ).first<{ ref_low_at_test: number; ref_high_at_test: number }>();
    expect(row!.ref_low_at_test).toBe(136);
    expect(row!.ref_high_at_test).toBe(146);
  });
});

describe("resolveTestDefinitions", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB);
  });

  it("returns a map of index → testDefId for known tests (stage-1 exact match, no LLM)", async () => {
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes','admin-1','admin-1')`,
    ).run();

    const result = await resolveTestDefinitions(env as any, env.DB, [
      { raw_name: "Sodium", canonical_name: "Sodium", key: "sodium", unit: "mmol/L" },
    ], "admin-1");

    expect(result[0]).toBe("td-sodium");
  });

  it("returns an empty record when tests array is empty", async () => {
    const result = await resolveTestDefinitions(env as any, env.DB, [], "admin-1");
    expect(result).toEqual({});
  });

  it("preserves index positions when multiple tests are resolved", async () => {
    await env.DB.prepare(
      `INSERT INTO test_definitions (id, canonical_key, canonical_name, label, unit, category, created_by, updated_by)
       VALUES ('td-sodium','sodium','Sodium','Sodium','mmol/L','electrolytes','admin-1','admin-1'),
              ('td-potassium','potassium','Potassium','Potassium','mmol/L','electrolytes','admin-1','admin-1')`,
    ).run();

    const result = await resolveTestDefinitions(env as any, env.DB, [
      { raw_name: "Sodium", canonical_name: "Sodium", key: "sodium", unit: "mmol/L" },
      { raw_name: "Potassium", canonical_name: "Potassium", key: "potassium", unit: "mmol/L" },
    ], "admin-1");

    expect(result[0]).toBe("td-sodium");
    expect(result[1]).toBe("td-potassium");
  });
});

describe("persistCultureResult", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    await seedDocument(env.DB, { type: "culture_report" });
  });

  it("inserts a row into culture_results", async () => {
    await persistCultureResult(env.DB, {
      specimen_type: "urine",
      collection_date: "2026-04-02",
      result_status: "positive",
      organism: "Escherichia coli",
      growth_quantity: "heavy",
      sensitivities: [{ antibiotic: "Ciprofloxacin", result: "S" }],
      comments: null,
    }, "patient-1", "doc-1", "admin-1");

    const row = await env.DB.prepare(
      "SELECT specimen_type, organism, result_status FROM culture_results WHERE document_id = 'doc-1'"
    ).first<{ specimen_type: string; organism: string; result_status: string }>();
    expect(row?.specimen_type).toBe("urine");
    expect(row?.organism).toBe("Escherichia coli");
    expect(row?.result_status).toBe("positive");
  });

  it("creates a clinical note when comments are present", async () => {
    await persistCultureResult(env.DB, {
      specimen_type: "sputum",
      collection_date: "2026-04-02",
      result_status: "positive",
      organism: "Klebsiella pneumoniae",
      growth_quantity: "moderate",
      sensitivities: [],
      comments: "ESBL suspected. Treat with meropenem.",
    }, "patient-1", "doc-1", "admin-1");

    const note = await env.DB.prepare(
      "SELECT summary FROM clinical_notes WHERE document_id = 'doc-1'"
    ).first<{ summary: string }>();
    expect(note?.summary).toBe("ESBL suspected. Treat with meropenem.");
  });

  it("skips clinical note when comments are null", async () => {
    await persistCultureResult(env.DB, {
      specimen_type: "blood",
      collection_date: null,
      result_status: "no_growth",
      organism: null,
      growth_quantity: null,
      sensitivities: [],
      comments: null,
    }, "patient-1", "doc-1", "admin-1");

    const note = await env.DB.prepare(
      "SELECT id FROM clinical_notes WHERE document_id = 'doc-1'"
    ).first();
    expect(note).toBeNull();
  });

  it("is idempotent — calling twice yields exactly one culture_results row", async () => {
    const payload: CultureReportExtraction = {
      specimen_type: "urine",
      collection_date: "2026-04-02",
      result_status: "positive",
      organism: "E. coli",
      growth_quantity: "heavy",
      sensitivities: [],
      comments: null,
    };
    await persistCultureResult(env.DB, payload, "patient-1", "doc-1", "admin-1");
    await persistCultureResult(env.DB, payload, "patient-1", "doc-1", "admin-1");

    const { count } = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM culture_results WHERE document_id = 'doc-1'"
    ).first<{ count: number }>() ?? { count: 0 };
    expect(count).toBe(1);
  });

  it("is idempotent — calling twice yields exactly one clinical_note", async () => {
    const payload: CultureReportExtraction = {
      specimen_type: "sputum",
      collection_date: "2026-04-02",
      result_status: "positive",
      organism: "Klebsiella",
      growth_quantity: "moderate",
      sensitivities: [],
      comments: "ESBL suspected. Treat with meropenem.",
    };
    await persistCultureResult(env.DB, payload, "patient-1", "doc-1", "admin-1");
    await persistCultureResult(env.DB, payload, "patient-1", "doc-1", "admin-1");

    const { count } = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM clinical_notes WHERE document_id = 'doc-1'"
    ).first<{ count: number }>() ?? { count: 0 };
    expect(count).toBe(1);
  });
});
