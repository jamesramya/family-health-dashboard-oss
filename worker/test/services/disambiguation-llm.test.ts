import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { disambiguateTest } from "../../src/services/disambiguation-llm";
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

  it("throws when resolveAI returns null", async () => {
    vi.mocked(resolveAI).mockResolvedValue(null);
    await expect(
      disambiguateTest(MOCK_ENV, { rawName: "X", canonicalNameExtracted: "X", keyExtracted: "x", unit: "", existing: [] }),
    ).rejects.toThrow(/test_disambig/);
  });

  it("sends cf-aig-cache-ttl: 300 header for AI Gateway response caching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      haikuOk({ is_duplicate: false, matched_canonical_key: null, reasoning: "distinct" }),
    );
    await disambiguateTest(MOCK_ENV, {
      rawName: "Ferritin", canonicalNameExtracted: "Ferritin", keyExtracted: "ferritin", unit: "ng/mL", existing: [],
    });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["cf-aig-cache-ttl"]).toBe("300");
  });
});
