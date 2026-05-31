import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseVitalsText } from "../../src/services/vitals-parser";
import type { Bindings } from "../../src/types";

vi.mock("../../src/services/ai-resolver", () => ({
  resolveAI: vi.fn(),
}));

import { resolveAI } from "../../src/services/ai-resolver";

const MOCK_ENV = {
  AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/acct/gw",
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

beforeEach(() => {
  vi.mocked(resolveAI).mockResolvedValue({
    provider: "google",
    model: "gemini-2.5-flash",
    apiKey: "test-google-key",
  });
});

afterEach(() => { vi.restoreAllMocks(); });

describe("parseVitalsText", () => {
  it("returns structured vitals from Gemini on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk(SAMPLE_VITALS)));

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    expect(result).toEqual(SAMPLE_VITALS);
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain("gemini-2.5-flash");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("uses OpenAI when resolver returns openai provider", async () => {
    vi.mocked(resolveAI).mockResolvedValue({
      provider: "openai",
      model: "gpt-4.1",
      apiKey: "sk-openai-test",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(openaiOk(SAMPLE_VITALS)));

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    expect(result).toEqual(SAMPLE_VITALS);
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain("openai");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws when resolveAI returns null", async () => {
    vi.mocked(resolveAI).mockResolvedValue(null);

    await expect(parseVitalsText("BP 130/85", MOCK_ENV))
      .rejects.toThrow(/vitals_parse/);
  });

  it("throws when AI_GATEWAY_URL is not configured", async () => {
    const envNoGateway = { ...MOCK_ENV, AI_GATEWAY_URL: undefined } as unknown as Bindings;

    await expect(parseVitalsText("BP 130/85", envNoGateway))
      .rejects.toThrow(/AI_GATEWAY_URL/);
  });

  it("throws on unsupported provider", async () => {
    vi.mocked(resolveAI).mockResolvedValue({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      apiKey: "sk-ant-test",
    });

    await expect(parseVitalsText("BP 130/85", MOCK_ENV))
      .rejects.toThrow(/unsupported provider/);
  });

  it("throws on Gemini HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service unavailable", { status: 503 })));

    await expect(parseVitalsText("BP 130/85", MOCK_ENV))
      .rejects.toThrow(/503/);
  });

  it("handles Gemini response wrapped in markdown code fences", async () => {
    const wrapped = `\`\`\`json\n${JSON.stringify(SAMPLE_VITALS)}\n\`\`\``;
    const rawGeminiResponse = new Response(
      JSON.stringify({ candidates: [{ content: { parts: [{ text: wrapped }] } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rawGeminiResponse));

    const result = await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);
    expect(result).toEqual(SAMPLE_VITALS);
  });

  it("sends cf-aig-cache-ttl: 300 header on Gemini path", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiOk(SAMPLE_VITALS)));

    await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["cf-aig-cache-ttl"]).toBe("300");
  });

  it("sends cf-aig-cache-ttl: 300 header on OpenAI path", async () => {
    vi.mocked(resolveAI).mockResolvedValue({
      provider: "openai",
      model: "gpt-4.1",
      apiKey: "sk-openai-test",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(openaiOk(SAMPLE_VITALS)));

    await parseVitalsText("BP 130/85, HR 72", MOCK_ENV);

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["cf-aig-cache-ttl"]).toBe("300");
  });
});
