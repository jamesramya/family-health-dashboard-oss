export type Provider = "openai" | "anthropic" | "google" | "deepgram";

export interface UseCaseInfo {
  label: string;
  description: string;
  primaryModel: string;
  fallbackModel: string | null;
  fallbackNote?: string;
}

export const USE_CASE_INFO: Record<string, UseCaseInfo> = {
  doc_extract:   { label: "Document extraction",         description: "PDF → structured JSON",         primaryModel: "gemini-2.5-flash",         fallbackModel: "gpt-4.1-mini" },
  vitals_parse:  { label: "Vitals parsing",              description: "NLP from voice or text input",  primaryModel: "gemini-2.5-flash",         fallbackModel: "gpt-4.1-nano" },
  test_disambig: { label: "Test disambiguation",         description: "Resolves ambiguous test names", primaryModel: "claude-haiku-4-5-20251001", fallbackModel: null, fallbackNote: "flags for review" },
  ref_range:     { label: "Reference range arbitration", description: "Selects reference ranges",       primaryModel: "claude-haiku-4-5-20251001", fallbackModel: null },
  voice_trans:   { label: "Voice transcription",         description: "Audio → text",                  primaryModel: "Deepgram nova-3",           fallbackModel: null },
};

export interface AISettings {
  gatewayUrl: string;
  keys: Record<Provider, string>;
}

const DEFAULTS: AISettings = {
  gatewayUrl: "",
  keys: { openai: "", anthropic: "", google: "", deepgram: "" },
};

const KEY = "ai.settings";

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { return DEFAULTS; }
}

export function saveAISettings(s: AISettings) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
