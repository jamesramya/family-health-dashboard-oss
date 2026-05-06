import type { Bindings } from "../types";
import { canonicalKey, titleCaseCanonicalName, resolveTestSynonym } from "./canonical-key";
import { disambiguateTest, type ExistingTestSummary } from "./disambiguation-llm";

export interface ExtractedTest {
  raw_name?: string;
  canonical_name?: string;
  key?: string;
  unit?: string;
  category?: string;
  ref_low?: number | null;
  ref_high?: number | null;
  ref_source?: string;
}

export type MergeStage = "exact" | "alias" | "llm" | "fallback";

export interface MergeResult {
  testDefId: string;
  stage: MergeStage;
  needsReview: boolean;
}

function collectAliasTokens(t: ExtractedTest, extractedName: string): string[] {
  const tokens = new Set<string>();
  for (const v of [t.raw_name, t.canonical_name, t.key, extractedName]) {
    if (!v) continue;
    tokens.add(v.toLowerCase().trim());
    try { tokens.add(canonicalKey(v)); } catch { /* ignore */ }
  }
  return [...tokens].filter(Boolean);
}

async function setLogMatch(db: D1Database, logId: string, testDefId: string): Promise<void> {
  await db.prepare(
    "UPDATE disambiguation_log SET matched_test_def_id = ? WHERE id = ?",
  ).bind(testDefId, logId).run();
}

export async function mergeOrCreate(
  env: Bindings,
  db: D1Database,
  t: ExtractedTest,
  userId: string,
): Promise<MergeResult> {
  const rawName = t.canonical_name ?? t.raw_name ?? t.key ?? "Unknown";
  const extractedName = resolveTestSynonym(rawName);
  const key = canonicalKey(extractedName);
  const logId = crypto.randomUUID();

  // Stage 1: exact canonical_key match, with canonical_name fallback for migrated rows
  // whose canonical_key has an id-suffix from migration 0004
  const exact = await db.prepare(
    `SELECT id FROM test_definitions
     WHERE (canonical_key = ? OR LOWER(canonical_name) = LOWER(?)) AND is_deleted = 0
     LIMIT 1`,
  ).bind(key, extractedName).first<{ id: string }>();
  if (exact) return { testDefId: exact.id, stage: "exact", needsReview: false };

  // Stage 2: alias match (json_each over aliases column)
  const aliasTokens = collectAliasTokens(t, extractedName);
  if (aliasTokens.length > 0) {
    const placeholders = aliasTokens.map(() => "?").join(",");
    const row = await db.prepare(
      `SELECT td.id FROM test_definitions td, json_each(td.aliases)
        WHERE td.is_deleted = 0 AND LOWER(json_each.value) IN (${placeholders})
        LIMIT 1`,
    ).bind(...aliasTokens).first<{ id: string }>();
    if (row) return { testDefId: row.id, stage: "alias", needsReview: false };
  }

  // Stage 3: LLM
  const { results: existingRows } = await db.prepare(
    "SELECT canonical_key, canonical_name, unit FROM test_definitions WHERE is_deleted = 0",
  ).all<{ canonical_key: string; canonical_name: string; unit: string }>();
  const existing: ExistingTestSummary[] = existingRows.map((r) => ({
    canonicalKey: r.canonical_key, canonicalName: r.canonical_name, unit: r.unit,
  }));

  let llmResult: Awaited<ReturnType<typeof disambiguateTest>> | null = null;
  let llmError: string | null = null;
  try {
    llmResult = await disambiguateTest(env, {
      rawName: t.raw_name ?? "",
      canonicalNameExtracted: t.canonical_name ?? "",
      keyExtracted: t.key ?? "",
      unit: t.unit ?? "",
      existing,
    });
  } catch (e) {
    llmError = e instanceof Error ? e.message : String(e);
  }

  // Always log the attempt (use pre-generated logId so we can UPDATE by primary key — race-safe)
  await db.prepare(
    `INSERT INTO disambiguation_log
       (id, raw_name, canonical_name_extracted, key_extracted, matched_test_def_id,
        is_duplicate, llm_model, llm_reasoning)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(
    logId,
    t.raw_name ?? null,
    t.canonical_name ?? null,
    t.key ?? null,
    llmResult?.isDuplicate ? 1 : 0,
    llmResult?.model ?? "claude-haiku-4-5 (failed)",
    llmResult?.reasoning ?? llmError ?? "LLM call failed",
  ).run();

  if (llmResult?.isDuplicate && llmResult.matchedCanonicalKey) {
    const matched = await db.prepare(
      "SELECT id, aliases FROM test_definitions WHERE canonical_key = ? AND is_deleted = 0",
    ).bind(llmResult.matchedCanonicalKey).first<{ id: string; aliases: string }>();
    if (matched) {
      const aliasSet = new Set<string>(JSON.parse(matched.aliases ?? "[]"));
      for (const tok of aliasTokens) aliasSet.add(tok);
      await db.prepare(
        "UPDATE test_definitions SET aliases = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?",
      ).bind(JSON.stringify([...aliasSet]), userId, matched.id).run();
      await setLogMatch(db, logId, matched.id);
      return { testDefId: matched.id, stage: "llm", needsReview: false };
    }
  }

  // Insert new test_definition (LLM said false OR LLM failed)
  const newId = crypto.randomUUID();
  const displayName = titleCaseCanonicalName(extractedName);
  const needsReview = llmError !== null ? 1 : 0;
  await db.prepare(
    `INSERT INTO test_definitions
       (id, canonical_key, canonical_name, label, unit, category,
        ref_low, ref_high, ref_source, aliases, needs_review, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    newId, key, displayName, displayName, t.unit ?? "", t.category ?? "other",
    t.ref_low ?? null, t.ref_high ?? null, t.ref_source ?? "lab",
    JSON.stringify(aliasTokens), needsReview, userId, userId,
  ).run();
  await setLogMatch(db, logId, newId);

  return {
    testDefId: newId,
    stage: llmError ? "fallback" : "llm",
    needsReview: Boolean(needsReview),
  };
}
