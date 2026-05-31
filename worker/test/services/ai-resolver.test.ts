import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { resolveAI, encryptKey } from "../../src/services/ai-resolver";
import { setupDb, seedAdmin } from "../helpers/setup-db";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

describe("resolveAI", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("returns null when use_case is not in routing table", async () => {
    const result = await resolveAI("unknown_use_case", { ...env, JWT_SECRET });
    expect(result).toBeNull();
  });

  it("falls back to env binding when no D1 key row exists", async () => {
    // doc_extract is seeded to google by default
    const result = await resolveAI("doc_extract", {
      ...env,
      JWT_SECRET,
      GOOGLE_API_KEY: "google-env-key",
    });
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("google");
    expect(result!.model).toBe("gemini-2.5-flash");
    expect(result!.apiKey).toBe("google-env-key");
  });

  it("D1 row wins over env binding when both exist", async () => {
    // Encrypt and store a key in D1
    const { ciphertext, iv } = await encryptKey("d1-google-key", JWT_SECRET);
    await env.DB.prepare(
      `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
       VALUES ('google', ?, ?, 'gemini-2.5-pro', 'admin-1')`
    )
      .bind(ciphertext, iv)
      .run();

    const result = await resolveAI("doc_extract", {
      ...env,
      JWT_SECRET,
      GOOGLE_API_KEY: "env-key-should-be-ignored",
    });
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe("d1-google-key");
    expect(result!.model).toBe("gemini-2.5-flash"); // routing model, not key row model
  });

  it("returns null when neither D1 nor env has a key for the provider", async () => {
    const result = await resolveAI("doc_extract", {
      ...env,
      JWT_SECRET,
      GOOGLE_API_KEY: undefined,
    });
    expect(result).toBeNull();
  });

  it("resolves voice_trans to deepgram via env binding", async () => {
    const result = await resolveAI("voice_trans", {
      ...env,
      JWT_SECRET,
      DEEPGRAM_API_KEY: "deepgram-env-key",
    });
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("deepgram");
    expect(result!.model).toBe("nova-3");
    expect(result!.apiKey).toBe("deepgram-env-key");
  });

  it("encryptKey / decryptKey round-trip (via D1 row)", async () => {
    const plaintext = "sk-ant-api-secret-key";
    const { ciphertext, iv } = await encryptKey(plaintext, JWT_SECRET);

    await env.DB.prepare(
      `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
       VALUES ('anthropic', ?, ?, 'claude-haiku-4-5-20251001', 'admin-1')`
    )
      .bind(ciphertext, iv)
      .run();

    const result = await resolveAI("test_disambig", { ...env, JWT_SECRET });
    expect(result).not.toBeNull();
    expect(result!.apiKey).toBe(plaintext);
  });
});
