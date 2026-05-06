import { describe, it, expect, vi, afterEach } from "vitest";
import { parseVitalsText } from "../../src/services/vitals-parser";
import type { Bindings } from "../../src/types";

const MOCK_ENV = {
  AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
  GOOGLE_API_KEY: "test-google-key",
  OPENAI_API_KEY: "test-openai-key",
} as unknown as Bindings;

const SAMPLE_VITALS = [
  { type: "bp", value_primary: 130, value_secondary: 85, unit: "mmHg", measured_at: "2026-04-07T08:00:00.000Z" },
  { type: "heart_rate", value_primary: 72, unit: "bpm", measured_at: "2026-04-07T08:00:00.000Z" },
];

function geminiOk(data: unknown) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function openaiOk(data: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

afterEach(() => { vi.restoreAllMocks(); });

describe("parseVitalsText", () => {
  it("returns structured vitals from Gemini 2.0 Flash on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk(SAMPLE_VITALS)));

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    expect(result).toEqual(SAMPLE_VITALS);
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain("gemini-2.5-flash");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to GPT-4.1 nano when Gemini fails with HTTP error", async () => {
    const geminiError = new Response("Service unavailable", { status: 503 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(geminiError)
      .mockResolvedValueOnce(openaiOk(SAMPLE_VITALS))
    );

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    expect(result).toEqual(SAMPLE_VITALS);
    expect(fetch).toHaveBeenCalledTimes(2);
    const openaiCall = (vi.mocked(fetch).mock.calls[1][0] as string);
    expect(openaiCall).toContain("openai");
  });

  it("falls back to GPT-4.1 nano when Gemini throws a network error", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce(openaiOk(SAMPLE_VITALS))
    );

    const result = await parseVitalsText("BP 130/85", MOCK_ENV);

    expect(result).toEqual(SAMPLE_VITALS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("throws when both Gemini and GPT fail", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("Gemini down"))
      .mockRejectedValueOnce(new Error("OpenAI down"))
    );

    await expect(parseVitalsText("BP 130/85", MOCK_ENV))
      .rejects.toThrow("OpenAI down");
  });

  it("skips GPT fallback when OPENAI_API_KEY is not set", async () => {
    const envWithoutOpenAI = { ...MOCK_ENV, OPENAI_API_KEY: undefined } as unknown as Bindings;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Gemini down")));

    await expect(parseVitalsText("BP 130/85", envWithoutOpenAI))
      .rejects.toThrow("Gemini down");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles Gemini response wrapped in markdown code fences", async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(SAMPLE_VITALS)}\n\`\`\``;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk(wrapped)));

    // geminiOk wraps in Gemini response envelope but text is already a string,
    // not double-encoded — reuse raw text response directly
    const rawGeminiResponse = new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: wrapped }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawGeminiResponse));

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);
    expect(result).toEqual(SAMPLE_VITALS);
  });
});
