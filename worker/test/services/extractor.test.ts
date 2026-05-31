import { describe, it, expect, vi, afterEach } from "vitest";
import { PROMPT_BLOOD_REPORT, PROMPT_CULTURE, classify } from "../../src/services/extractor";
import type { Bindings } from "../../src/types";

const MOCK_ENV = {
  AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
  GOOGLE_API_KEY: "test-google-key",
} as unknown as Bindings;

function geminiOk(text: string) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => vi.restoreAllMocks());

describe("extractor prompt", () => {
  it("requires Title Case canonical_name", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/Title Case/);
  });
  it("forbids snake_case", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/never.*snake_case/i);
  });
  it("forbids specimen suffixes", () => {
    expect(PROMPT_BLOOD_REPORT).toMatch(/never append.*(Serum|specimen)/i);
  });
});

describe("PROMPT_CULTURE", () => {
  it("instructs the LLM to return specimen_type", () => {
    expect(PROMPT_CULTURE).toMatch(/specimen_type/);
  });
  it("includes all valid result_status values", () => {
    expect(PROMPT_CULTURE).toMatch(/no_growth/);
    expect(PROMPT_CULTURE).toMatch(/contaminated/);
  });
  it("instructs S/I/R sensitivity extraction", () => {
    expect(PROMPT_CULTURE).toMatch(/"S"\s*\|\s*"I"\s*\|\s*"R"/);
  });
});

describe("classify (Gemini fetch)", () => {
  it("sends cf-aig-cache-ttl: 300 header for AI Gateway response caching", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(geminiOk("blood_report"));

    await classify(new Uint8Array([1, 2, 3]), "application/pdf", MOCK_ENV);

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["cf-aig-cache-ttl"]).toBe("300");
  });
});
