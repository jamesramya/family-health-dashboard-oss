// worker/src/services/vitals-parser.ts
//
// NLP vitals extraction: Gemini 2.0 Flash (primary) → GPT-4.1 nano (fallback).
// Both calls go through the Cloudflare AI Gateway for unified observability.

import type { Bindings } from "../types";

export interface ParsedVital {
  type: string;
  value_primary: number;
  value_secondary?: number;
  unit: string;
  measured_at?: string;
  measured_date?: string;
  context?: string;
}

const VALID_TYPES = new Set(["bp", "glucose", "weight", "heart_rate", "spo2", "temperature"]);

const prompt = (text: string, timezone: string, localDate: string): string => {
  return `Extract all vital signs from the text below and return a JSON array.

The user's timezone is ${timezone}. Today's date in that timezone is ${localDate}.

Each item must have:
- type: one of bp | heart_rate | temperature | weight | spo2 | glucose
- value_primary: number (for bp this is systolic)
- value_secondary: number (bp diastolic only)
- unit: string (e.g. mmHg, bpm, °C, °F, kg, lbs, %, mmol/L, mg/dL)
- measured_at: ISO 8601 UTC datetime — ONLY when a specific clock time is explicitly stated (e.g. "8pm", "08:30 AM"). Treat the time as ${timezone} and convert to UTC.
- measured_date: YYYY-MM-DD — ONLY when a date is mentioned but no specific time (e.g. "yesterday", "last Monday"). Use the date in ${timezone}.
- Omit both measured_at and measured_date if neither a date nor time is mentioned in the text.
- context: string — if explicitly stated use that (e.g. "fasting", "after meal", "resting");
  otherwise use the default abbreviation for the type: bp→"BP", glucose→"CBG", heart_rate→"Pulse", temperature→"Temp", spo2→"SpO2", weight→"Weight"

Return ONLY a valid JSON array, no markdown, no explanation.

Text: "${text}"`;
};

// ---------------------------------------------------------------------------
// JSON extraction — strips markdown fences if present
// ---------------------------------------------------------------------------

function extractJson(raw: string): ParsedVital[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("No JSON array found in AI response");

  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("AI response is not an array");

  return parsed.filter((v) => VALID_TYPES.has(v.type) && typeof v.value_primary === "number");
}

// ---------------------------------------------------------------------------
// Gemini 2.0 Flash via AI Gateway
// ---------------------------------------------------------------------------

async function parseWithGemini(text: string, timezone: string, localDate: string, env: Bindings): Promise<ParsedVital[]> {
  const url = `${env.AI_GATEWAY_URL}/google-ai-studio/v1/models/gemini-2.5-flash:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": env.GOOGLE_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt(text, timezone, localDate) }] }],
      generationConfig: { temperature: 0 },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json<{ candidates: { content: { parts: { text: string }[] } }[] }>();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return extractJson(raw);
}

// ---------------------------------------------------------------------------
// GPT-4.1 nano via AI Gateway
// ---------------------------------------------------------------------------

async function parseWithGpt(text: string, timezone: string, localDate: string, env: Bindings): Promise<ParsedVital[]> {
  const url = `${env.AI_GATEWAY_URL}/openai/v1/chat/completions`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4.1-nano",
      messages: [{ role: "user", content: prompt(text, timezone, localDate) }],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`GPT-4.1 nano ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json<{ choices: { message: { content: string } }[] }>();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return extractJson(raw);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function parseVitalsText(text: string, env: Bindings, timezone?: string, localDate?: string): Promise<ParsedVital[]> {
  const tz = timezone ?? "UTC";
  const date = localDate ?? new Date().toISOString().slice(0, 10);
  try {
    return await parseWithGemini(text, tz, date, env);
  } catch (geminiErr) {
    if (!env.OPENAI_API_KEY) throw geminiErr;
    return await parseWithGpt(text, tz, date, env);
  }
}
