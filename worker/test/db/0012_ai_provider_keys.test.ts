import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { setupDb, seedAdmin } from "../helpers/setup-db";

describe("0012_ai_provider_keys migration", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("ai_provider_keys table exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_provider_keys'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("ai_provider_keys");
  });

  it("ai_provider_keys can be inserted and selected", async () => {
    await env.DB.prepare(
      `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
       VALUES ('openai', 'encrypted-ciphertext', 'base64iv', 'gpt-4.1', 'admin-1')`
    ).run();

    const row = await env.DB.prepare(
      "SELECT provider, ciphertext, iv, model, updated_by FROM ai_provider_keys WHERE provider = 'openai'"
    ).first<{ provider: string; ciphertext: string; iv: string; model: string; updated_by: string }>();

    expect(row?.provider).toBe("openai");
    expect(row?.ciphertext).toBe("encrypted-ciphertext");
    expect(row?.iv).toBe("base64iv");
    expect(row?.model).toBe("gpt-4.1");
    expect(row?.updated_by).toBe("admin-1");
  });

  it("provider is the primary key — duplicate insert throws", async () => {
    await env.DB.prepare(
      `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
       VALUES ('anthropic', 'ct1', 'iv1', 'claude-haiku-4-5-20251001', 'admin-1')`
    ).run();

    await expect(
      env.DB.prepare(
        `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
         VALUES ('anthropic', 'ct2', 'iv2', 'claude-haiku-4-5-20251001', 'admin-1')`
      ).run()
    ).rejects.toThrow();
  });

  it("updated_at is auto-populated", async () => {
    await env.DB.prepare(
      `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_by)
       VALUES ('google', 'ct', 'iv', 'gemini-2.5-flash', 'admin-1')`
    ).run();

    const row = await env.DB.prepare(
      "SELECT updated_at FROM ai_provider_keys WHERE provider = 'google'"
    ).first<{ updated_at: string }>();

    expect(row?.updated_at).toBeTruthy();
  });
});

describe("0013_ai_use_case_routing migration", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("ai_use_case_routing table exists", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_use_case_routing'"
    ).first<{ name: string }>();
    expect(result?.name).toBe("ai_use_case_routing");
  });

  it("all 5 default use-case rows are seeded", async () => {
    const rows = await env.DB.prepare(
      "SELECT use_case, provider, model FROM ai_use_case_routing ORDER BY use_case"
    ).all<{ use_case: string; provider: string; model: string }>();

    expect(rows.results).toHaveLength(5);
    const useCases = rows.results.map((r) => r.use_case);
    expect(useCases).toContain("doc_extract");
    expect(useCases).toContain("vitals_parse");
    expect(useCases).toContain("test_disambig");
    expect(useCases).toContain("ref_range");
    expect(useCases).toContain("voice_trans");
  });

  it("doc_extract defaults to google / gemini-2.5-flash", async () => {
    const row = await env.DB.prepare(
      "SELECT provider, model FROM ai_use_case_routing WHERE use_case = 'doc_extract'"
    ).first<{ provider: string; model: string }>();

    expect(row?.provider).toBe("google");
    expect(row?.model).toBe("gemini-2.5-flash");
  });

  it("voice_trans defaults to deepgram / nova-3", async () => {
    const row = await env.DB.prepare(
      "SELECT provider, model FROM ai_use_case_routing WHERE use_case = 'voice_trans'"
    ).first<{ provider: string; model: string }>();

    expect(row?.provider).toBe("deepgram");
    expect(row?.model).toBe("nova-3");
  });

  it("use_case is the primary key — duplicate insert throws", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO ai_use_case_routing (use_case, provider, model, updated_by)
         VALUES ('doc_extract', 'openai', 'gpt-4.1', 'admin-1')`
      ).run()
    ).rejects.toThrow();
  });

  it("can upsert (replace) a routing row", async () => {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO ai_use_case_routing (use_case, provider, model, updated_at, updated_by)
       VALUES ('doc_extract', 'openai', 'gpt-4.1', datetime('now'), 'admin-1')`
    ).run();

    const row = await env.DB.prepare(
      "SELECT provider, model FROM ai_use_case_routing WHERE use_case = 'doc_extract'"
    ).first<{ provider: string; model: string }>();

    expect(row?.provider).toBe("openai");
    expect(row?.model).toBe("gpt-4.1");
  });
});
