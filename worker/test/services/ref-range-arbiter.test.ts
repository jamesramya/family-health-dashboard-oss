import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { arbitrateRefRange } from "../../src/services/ref-range-arbiter";
import type { Bindings } from "../../src/types";

vi.mock("../../src/services/ai-resolver", () => ({
  resolveAI: vi.fn(),
}));

import { resolveAI } from "../../src/services/ai-resolver";

const MOCK_ENV = {
  AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
} as unknown as Bindings;

beforeEach(() => {
  vi.mocked(resolveAI).mockResolvedValue({
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    apiKey: "sk-ant-test",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("arbitrateRefRange", () => {
  it("short-circuits when all competing ranges identical (no LLM call)", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await arbitrateRefRange(MOCK_ENV, {
      canonicalName: "Sodium", unit: "mmol/L", patientAgeYears: 65, patientGender: "female",
      competingRanges: [{ refLow: 136, refHigh: 145 }, { refLow: 136, refHigh: 145 }],
    });
    expect(result.refLow).toBe(136);
    expect(result.refHigh).toBe(145);
    expect(spy).not.toHaveBeenCalled();
  });

  it("picks clinically-correct range with citation", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
        ref_low: 136, ref_high: 145,
        source_citation: "Tietz Textbook of Clinical Chemistry, 6th ed.",
        reasoning: "Standard adult serum sodium range.",
      }) }] }), { status: 200 }),
    );
    const result = await arbitrateRefRange(MOCK_ENV, {
      canonicalName: "Sodium", unit: "mmol/L", patientAgeYears: 65, patientGender: "female",
      competingRanges: [{ refLow: 136, refHigh: 145 }, { refLow: 136, refHigh: 146 }],
    });
    expect(result.refLow).toBe(136);
    expect(result.refHigh).toBe(145);
    expect(result.refSource).toBe("clinical");
    expect(result.refNote).toContain("Tietz");
  });

  it("rejects range outside observed min/max (LLM hallucination guard)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({
        ref_low: 50, ref_high: 200, source_citation: "X", reasoning: "Y",
      }) }] }), { status: 200 }),
    );
    await expect(arbitrateRefRange(MOCK_ENV, {
      canonicalName: "Sodium", unit: "mmol/L", patientAgeYears: 65, patientGender: "female",
      competingRanges: [{ refLow: 136, refHigh: 145 }, { refLow: 136, refHigh: 146 }],
    })).rejects.toThrow(/outside observed/);
  });

  it("throws on Haiku HTTP failure", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(arbitrateRefRange(MOCK_ENV, {
      canonicalName: "Sodium", unit: "mmol/L", patientAgeYears: 65, patientGender: "female",
      competingRanges: [{ refLow: 136, refHigh: 145 }, { refLow: 136, refHigh: 146 }],
    })).rejects.toThrow();
  });

  it("throws when resolveAI returns null", async () => {
    vi.mocked(resolveAI).mockResolvedValue(null);
    await expect(arbitrateRefRange(MOCK_ENV, {
      canonicalName: "Sodium", unit: "mmol/L", patientAgeYears: 65, patientGender: "female",
      competingRanges: [{ refLow: 136, refHigh: 145 }, { refLow: 136, refHigh: 146 }],
    })).rejects.toThrow(/ref_range/);
  });
});
