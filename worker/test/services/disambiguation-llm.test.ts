import { describe, it, expect, vi, afterEach } from "vitest";
import { disambiguateTest } from "../../src/services/disambiguation-llm";
import type { Bindings } from "../../src/types";

const MOCK_ENV = {
  AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
  ANTHROPIC_API_KEY: "sk-ant-test",
} as unknown as Bindings;

afterEach(() => vi.restoreAllMocks());

function haikuOk(payload: unknown) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("disambiguateTest", () => {
  it("returns is_duplicate=true with matched_canonical_key on match", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      haikuOk({ is_duplicate: true, matched_canonical_key: "haemoglobin", reasoning: "Hb = haemoglobin" }),
    );
    const result = await disambiguateTest(MOCK_ENV, {
      rawName: "HB", canonicalNameExtracted: "Hb", keyExtracted: "hb", unit: "g/dL",
      existing: [
        { canonicalKey: "haemoglobin", canonicalName: "Haemoglobin", unit: "g/dL" },
        { canonicalKey: "haematocrit", canonicalName: "Haematocrit", unit: "%" },
      ],
    });
    expect(result.isDuplicate).toBe(true);
    expect(result.matchedCanonicalKey).toBe("haemoglobin");
    expect(result.reasoning).toContain("haemoglobin");
  });

  it("returns is_duplicate=false when no match", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      haikuOk({ is_duplicate: false, matched_canonical_key: null, reasoning: "Ferritin is distinct." }),
    );
    const result = await disambiguateTest(MOCK_ENV, {
      rawName: "Serum Ferritin", canonicalNameExtracted: "Ferritin", keyExtracted: "ferritin", unit: "ng/mL",
      existing: [{ canonicalKey: "haemoglobin", canonicalName: "Haemoglobin", unit: "g/dL" }],
    });
    expect(result.isDuplicate).toBe(false);
    expect(result.matchedCanonicalKey).toBeNull();
  });

  it("throws on non-2xx response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("rate limited", { status: 429 }));
    await expect(
      disambiguateTest(MOCK_ENV, { rawName: "X", canonicalNameExtracted: "X", keyExtracted: "x", unit: "", existing: [] }),
    ).rejects.toThrow(/429|rate limited/i);
  });

  it("throws on malformed JSON response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "not json" }] }), { status: 200 }),
    );
    await expect(
      disambiguateTest(MOCK_ENV, { rawName: "X", canonicalNameExtracted: "X", keyExtracted: "x", unit: "", existing: [] }),
    ).rejects.toThrow();
  });

  it("rejects matched_canonical_key not in existing list (hallucination guard)", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      haikuOk({ is_duplicate: true, matched_canonical_key: "fake_key", reasoning: "..." }),
    );
    await expect(
      disambiguateTest(MOCK_ENV, {
        rawName: "X", canonicalNameExtracted: "X", keyExtracted: "x", unit: "",
        existing: [{ canonicalKey: "sodium", canonicalName: "Sodium", unit: "mmol/L" }],
      }),
    ).rejects.toThrow(/fake_key/);
  });
});
