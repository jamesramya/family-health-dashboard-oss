import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setupDb, seedAdmin } from "../helpers/setup-db";
import { mergeOrCreate } from "../../src/services/test-merger";

afterEach(() => vi.restoreAllMocks());

async function seedTestDef(
  db: D1Database,
  opts: { id: string; canonicalKey: string; canonicalName: string; unit?: string; aliases?: string[]; createdBy: string },
) {
  await db.prepare(
    `INSERT INTO test_definitions
       (id, canonical_key, canonical_name, label, unit, category, aliases, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, 'electrolytes', ?, ?, ?)`,
  ).bind(
    opts.id, opts.canonicalKey, opts.canonicalName, opts.canonicalName,
    opts.unit ?? "mmol/L",
    JSON.stringify(opts.aliases ?? []), opts.createdBy, opts.createdBy,
  ).run();
}

describe("mergeOrCreate", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB, { id: "u1", email: "a@b.com" });
  });

  it("Stage 1: matches by canonical_key (no LLM call)", async () => {
    await seedTestDef(env.DB, { id: "td1", canonicalKey: "sodium", canonicalName: "Sodium", createdBy: "u1" });
    const spy = vi.spyOn(global, "fetch");
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "Sodium", canonical_name: "Sodium", key: "sodium", unit: "mmol/L", category: "electrolytes",
    }, "u1");
    expect(result.testDefId).toBe("td1");
    expect(result.stage).toBe("exact");
    expect(spy).not.toHaveBeenCalled();
  });

  it("Stage 1: case/spec-suffix variants hit the same key", async () => {
    await seedTestDef(env.DB, { id: "td1", canonicalKey: "sodium", canonicalName: "Sodium", createdBy: "u1" });
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "Sodium, Serum", canonical_name: "SODIUM", key: "sodium_serum", unit: "mmol/L", category: "electrolytes",
    }, "u1");
    expect(result.testDefId).toBe("td1");
    expect(result.stage).toBe("exact");
  });

  it("Stage 2: matches by alias", async () => {
    await seedTestDef(env.DB, {
      id: "td1", canonicalKey: "haemoglobin", canonicalName: "Haemoglobin",
      aliases: ["hb", "hgb"], createdBy: "u1",
    });
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "HB", canonical_name: "Hb", key: "hb", unit: "g/dL", category: "haematology",
    }, "u1");
    expect(result.testDefId).toBe("td1");
    expect(result.stage).toBe("alias");
  });

  it("Stage 3: calls Haiku on miss, appends alias on is_duplicate=true", async () => {
    await seedTestDef(env.DB, {
      id: "td1", canonicalKey: "haemoglobin", canonicalName: "Haemoglobin",
      aliases: [], createdBy: "u1", unit: "g/dL",
    });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
          is_duplicate: true, matched_canonical_key: "haemoglobin", reasoning: "Total Hemoglobin = Haemoglobin",
        }) }] }), { status: 200 },
      ),
    );
    // Use a name NOT in the synonym map so it reaches Stage 3
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "Total Hemoglobin", canonical_name: "Total Hemoglobin", key: "totalhemoglobin", unit: "g/dL", category: "haematology",
    }, "u1");
    expect(result.testDefId).toBe("td1");
    expect(result.stage).toBe("llm");
    const row = await env.DB.prepare("SELECT aliases FROM test_definitions WHERE id='td1'").first<{ aliases: string }>();
    const aliases = JSON.parse(row!.aliases);
    expect(aliases).toContain("totalhemoglobin");
  });

  it("Stage 3: creates new test_def when LLM says is_duplicate=false", async () => {
    await seedTestDef(env.DB, { id: "td1", canonicalKey: "haemoglobin", canonicalName: "Haemoglobin", createdBy: "u1" });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
          is_duplicate: false, matched_canonical_key: null, reasoning: "Ferritin is distinct",
        }) }] }), { status: 200 },
      ),
    );
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "Serum Ferritin", canonical_name: "Ferritin", key: "ferritin",
      unit: "ng/mL", category: "other", ref_low: 30, ref_high: 400,
    }, "u1");
    expect(result.needsReview).toBe(false);
    const def = await env.DB.prepare("SELECT * FROM test_definitions WHERE id = ?").bind(result.testDefId).first<any>();
    expect(def.canonical_key).toBe("ferritin");
    expect(def.canonical_name).toBe("Ferritin");
    expect(def.needs_review).toBe(0);
  });

  it("Stage 3 failure: creates new def with needs_review=1", async () => {
    await seedTestDef(env.DB, { id: "td1", canonicalKey: "haemoglobin", canonicalName: "Haemoglobin", createdBy: "u1" });
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    const result = await mergeOrCreate(env as any, env.DB, {
      raw_name: "Unknown Test XYZ", canonical_name: "Unknown Test", key: "unknown_test",
      unit: "", category: "other",
    }, "u1");
    expect(result.stage).toBe("fallback");
    expect(result.needsReview).toBe(true);
    const def = await env.DB.prepare("SELECT needs_review FROM test_definitions WHERE id = ?").bind(result.testDefId).first<any>();
    expect(def.needs_review).toBe(1);
  });

  it("logs every Stage 3 call to disambiguation_log", async () => {
    await seedTestDef(env.DB, { id: "td1", canonicalKey: "haemoglobin", canonicalName: "Haemoglobin", createdBy: "u1" });
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
          is_duplicate: true, matched_canonical_key: "haemoglobin", reasoning: "match",
        }) }] }), { status: 200 },
      ),
    );
    await mergeOrCreate(env as any, env.DB, {
      raw_name: "HB", canonical_name: "Hb", key: "hb", unit: "g/dL", category: "haematology",
    }, "u1");
    const { results } = await env.DB.prepare("SELECT * FROM disambiguation_log").all<any>();
    expect(results.length).toBe(1);
    expect(results[0].raw_name).toBe("HB");
    expect(results[0].matched_test_def_id).toBe("td1");
    expect(results[0].is_duplicate).toBe(1);
  });
});
