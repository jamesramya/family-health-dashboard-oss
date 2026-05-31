import type { Bindings } from "../types";

export const PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "deepgram",
  "mistral",
  "groq",
  "cohere",
  "workers-ai",
  "perplexity",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const USE_CASE_IDS = [
  "doc_extract",
  "vitals_parse",
  "test_disambig",
  "ref_range",
  "voice_trans",
] as const;

export type UseCaseId = (typeof USE_CASE_IDS)[number];

// Maps provider ID to the Bindings key that holds its env secret
export const ENV_KEY: Partial<Record<string, keyof Bindings>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  deepgram: "DEEPGRAM_API_KEY",
};

/** Extracts account_id and gateway_id from AI_GATEWAY_URL.
 *  URL format: https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}
 *  Returns null if the URL is missing or malformed.
 */
export function parseGatewayUrl(url: string | undefined): { account_id: string; gateway_id: string } | null {
  if (!url) return null;
  const match = url.match(/\/v1\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { account_id: match[1], gateway_id: match[2] };
}

export interface ResolvedAI {
  provider: string;
  model: string;
  apiKey: string;
}

export async function resolveAI(useCase: string, env: Bindings): Promise<ResolvedAI | null> {
  // 1. Get routing from D1
  const row = await env.DB.prepare(
    "SELECT provider, model FROM ai_use_case_routing WHERE use_case = ?"
  )
    .bind(useCase)
    .first<{ provider: string; model: string }>();
  if (!row) return null;

  // 2. Try to get API key from D1 (encrypted)
  const keyRow = await env.DB.prepare(
    "SELECT ciphertext, iv FROM ai_provider_keys WHERE provider = ?"
  )
    .bind(row.provider)
    .first<{ ciphertext: string; iv: string }>();

  if (keyRow) {
    const apiKey = await decryptKey(keyRow.ciphertext, keyRow.iv, env.JWT_SECRET);
    return { provider: row.provider, model: row.model, apiKey };
  }

  // 3. Fall back to env binding
  const envKey = ENV_KEY[row.provider];
  const apiKey = envKey ? (env[envKey] as string | undefined) : undefined;
  if (apiKey) return { provider: row.provider, model: row.model, apiKey };

  return null;
}

async function deriveKey(jwtSecret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(jwtSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("ai-keys-v1"),
      info: enc.encode("ai-keys-v1"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptKey(
  plaintext: string,
  jwtSecret: string,
): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(jwtSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
}

async function decryptKey(ciphertext: string, ivB64: string, jwtSecret: string): Promise<string> {
  const key = await deriveKey(jwtSecret);
  const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
  const data = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return new TextDecoder().decode(decrypted);
}
