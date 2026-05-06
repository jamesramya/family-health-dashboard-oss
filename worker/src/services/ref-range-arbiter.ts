import type { Bindings } from "../types";
import { assertDisambiguationEnv } from "./disambiguation-llm";

export interface CompetingRange {
  refLow: number | null;
  refHigh: number | null;
}

export interface ArbitrateInput {
  canonicalName: string;
  unit: string;
  patientAgeYears: number | null;
  patientGender: "male" | "female" | "other" | null;
  competingRanges: CompetingRange[];
}

export interface ArbitrationResult {
  refLow: number;
  refHigh: number;
  refSource: "clinical" | "identical";
  refNote: string;
  model: string;
}

const MODEL = "claude-haiku-4-5-20251001";

export async function arbitrateRefRange(
  env: Bindings,
  input: ArbitrateInput,
): Promise<ArbitrationResult> {
  // Short-circuit: all competing ranges identical — no arbitration needed, no LLM call
  const lowsAll = input.competingRanges.map((r) => r.refLow);
  const highsAll = input.competingRanges.map((r) => r.refHigh);
  if (
    lowsAll.length > 0 &&
    lowsAll.every((l) => l != null && l === lowsAll[0]) &&
    highsAll.every((h) => h != null && h === highsAll[0])
  ) {
    return {
      refLow: lowsAll[0] as number,
      refHigh: highsAll[0] as number,
      refSource: "identical",
      refNote: "All competing ranges agreed; no arbitration performed.",
      model: "none",
    };
  }

  assertDisambiguationEnv(env);

  const prompt = `You are a clinical laboratory reference expert.
For the test "${input.canonicalName}" (unit: ${input.unit || "unspecified"}), produce the single reference range appropriate for an adult ${input.patientGender ?? "unspecified-gender"} patient aged ${input.patientAgeYears ?? "unspecified"} years.

Consult standard clinical-laboratory references (Tietz Textbook of Clinical Chemistry, Harrison's Principles of Internal Medicine, AACC guidelines, or equivalent peer-reviewed sources). Cite which source you used.

Competing lab-supplied ranges observed in our data:
${input.competingRanges.map((r, i) => `  [${i + 1}] ${r.refLow ?? "-"} .. ${r.refHigh ?? "-"}`).join("\n")}

Reply with JSON ONLY, no prose, shape:
{ "ref_low": number, "ref_high": number, "source_citation": "string", "reasoning": "string" }`;

  const res = await fetch(`${env.AI_GATEWAY_URL}/anthropic/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Haiku ref-range arbitration failed: ${res.status} ${body.slice(0, 200)}`);
  }

  const payload = await res.json() as { content?: { text?: string }[] };
  const text = payload.content?.[0]?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Haiku returned unparseable arbitration: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(match[0]) as {
    ref_low: number; ref_high: number; source_citation: string; reasoning: string;
  };

  // Hallucination guard — returned range must lie within observed competing envelope
  const lows = input.competingRanges.map((r) => r.refLow).filter((x): x is number => x != null);
  const highs = input.competingRanges.map((r) => r.refHigh).filter((x): x is number => x != null);
  if (lows.length > 0 && parsed.ref_low < Math.min(...lows)) {
    throw new Error(`Arbitrated ref_low=${parsed.ref_low} outside observed range (min=${Math.min(...lows)})`);
  }
  if (highs.length > 0 && parsed.ref_high > Math.max(...highs)) {
    throw new Error(`Arbitrated ref_high=${parsed.ref_high} outside observed range (max=${Math.max(...highs)})`);
  }
  if (parsed.ref_low >= parsed.ref_high) {
    throw new Error(`Arbitrated range invalid: low=${parsed.ref_low} >= high=${parsed.ref_high}`);
  }

  return {
    refLow: parsed.ref_low,
    refHigh: parsed.ref_high,
    refSource: "clinical",
    refNote: `${parsed.source_citation} — ${parsed.reasoning}`,
    model: MODEL,
  };
}
