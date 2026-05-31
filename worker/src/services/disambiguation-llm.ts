import type { Bindings } from "../types";
import { resolveAI } from "./ai-resolver";

export interface ExistingTestSummary {
  canonicalKey: string;
  canonicalName: string;
  unit: string;
}

export interface DisambiguationInput {
  rawName: string;
  canonicalNameExtracted: string;
  keyExtracted: string;
  unit: string;
  existing: ExistingTestSummary[];
}

export interface DisambiguationResult {
  isDuplicate: boolean;
  matchedCanonicalKey: string | null;
  reasoning: string;
  model: string;
}

const TIMEOUT_MS = 10_000;

export async function disambiguateTest(
  env: Bindings,
  input: DisambiguationInput,
): Promise<DisambiguationResult> {
  const resolved = await resolveAI("test_disambig", env);
  if (!resolved) throw new Error("No AI config for test_disambig — configure anthropic provider");
  if (!env.AI_GATEWAY_URL) throw new Error("AI_GATEWAY_URL is not configured");

  const existingList = input.existing
    .map((e) => `${e.canonicalKey}: ${e.canonicalName} (${e.unit || "—"})`)
    .join("\n");

  const prompt = `You are a clinical terminology expert.

Existing tracked tests:
${existingList || "(none)"}

New test from lab report:
  raw_name: "${input.rawName}"
  canonical_name: "${input.canonicalNameExtracted}"
  key: "${input.keyExtracted}"
  unit: "${input.unit || ""}"

Is this new test the same measurement as any existing tracked test, or is it genuinely new and distinct?

Consider:
- Common abbreviations (Na = Sodium, Hb = Haemoglobin, eGFR = Estimated GFR)
- Unit consistency (same test, same unit = strong signal)
- Test synonyms across different lab systems
- Specimen variations (serum vs plasma for the same analyte are the same test for trend purposes)

Return ONLY valid JSON, no preamble:
{ "is_duplicate": boolean, "matched_canonical_key": "<key from existing list> OR null", "reasoning": "one sentence" }`;

  const url = `${env.AI_GATEWAY_URL.replace(/\/$/, "")}/anthropic/v1/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": resolved.apiKey,
        "anthropic-version": "2023-06-01",
        "cf-aig-cache-ttl": "300",
      },
      body: JSON.stringify({
        model: resolved.model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`disambiguation LLM ${res.status}: ${await res.text()}`);
  }
  const body = await res.json<{ content: Array<{ type: string; text: string }> }>();
  const text = body.content?.find((c) => c.type === "text")?.text ?? "";
  let parsed: { is_duplicate: boolean; matched_canonical_key: string | null; reasoning: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`disambiguation LLM returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (parsed.is_duplicate && parsed.matched_canonical_key) {
    const valid = input.existing.some((e) => e.canonicalKey === parsed.matched_canonical_key);
    if (!valid) {
      throw new Error(
        `disambiguation LLM returned unknown matched_canonical_key='${parsed.matched_canonical_key}'`,
      );
    }
  }

  return {
    isDuplicate: Boolean(parsed.is_duplicate),
    matchedCanonicalKey: parsed.is_duplicate ? parsed.matched_canonical_key : null,
    reasoning: parsed.reasoning ?? "",
    model: resolved.model,
  };
}
