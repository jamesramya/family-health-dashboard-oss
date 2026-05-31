import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

describe("GET /api/ai/providers", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin gets list of all 9 providers with has_key boolean", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ providers: { provider: string; has_key: boolean; model: string | null }[] }>();
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers).toHaveLength(9);
    const ids = body.providers.map((p) => p.provider);
    expect(ids).toContain("openai");
    expect(ids).toContain("anthropic");
    expect(ids).toContain("google");
    expect(ids).toContain("deepgram");
    expect(ids).toContain("mistral");
    expect(ids).toContain("groq");
    expect(ids).toContain("cohere");
    expect(ids).toContain("workers-ai");
    expect(ids).toContain("perplexity");
    // has_key should be boolean, never a plaintext key
    for (const p of body.providers) {
      expect(typeof p.has_key).toBe("boolean");
    }
  });

  it("returns has_key=false for all providers when none are stored", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      // vitest.config.ts injects ANTHROPIC_API_KEY via miniflare bindings; null all four to test the true "no keys" state
      { ...env, JWT_SECRET, ANTHROPIC_API_KEY: undefined, OPENAI_API_KEY: undefined, GOOGLE_API_KEY: undefined, DEEPGRAM_API_KEY: undefined }
    );
    const body = await res.json<{ providers: { has_key: boolean }[] }>();
    expect(body.providers.every((p) => p.has_key === false)).toBe(true);
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/api/ai/providers", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/ai/providers — env var fallback", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("provider with only an env key has has_key=true and source=env", async () => {
    const token = await adminToken();
    const envWithKey = { ...env, JWT_SECRET, ANTHROPIC_API_KEY: "sk-ant-env-key" };
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      envWithKey
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ providers: { provider: string; has_key: boolean; source: string | null }[] }>();
    const anthropic = body.providers.find((p) => p.provider === "anthropic");
    expect(anthropic?.has_key).toBe(true);
    expect(anthropic?.source).toBe("env");
  });

  it("provider with a D1 key shows source=d1 even if env key also exists", async () => {
    const token = await adminToken();
    // Store a key in D1
    await app.request(
      "/api/ai/providers/openai",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "sk-d1-key", model: "gpt-4.1" }),
      },
      { ...env, JWT_SECRET }
    );
    // Now also provide an env key — D1 should win
    const envWithKey = { ...env, JWT_SECRET, OPENAI_API_KEY: "sk-env-key" };
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      envWithKey
    );
    const body = await res.json<{ providers: { provider: string; has_key: boolean; source: string | null }[] }>();
    const openai = body.providers.find((p) => p.provider === "openai");
    expect(openai?.has_key).toBe(true);
    expect(openai?.source).toBe("d1");
  });

  it("provider with no D1 key and no env key has has_key=false and source=null", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      { ...env, JWT_SECRET }
    );
    const body = await res.json<{ providers: { provider: string; has_key: boolean; source: string | null }[] }>();
    const mistral = body.providers.find((p) => p.provider === "mistral");
    expect(mistral?.has_key).toBe(false);
    expect(mistral?.source).toBeNull();
  });
});

describe("PUT /api/ai/providers/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin can store a provider key — response never contains plaintext key", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/providers/openai",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "sk-real-openai-key", model: "gpt-4.1" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("sk-real-openai-key");
  });

  it("stored key is encrypted — row does not contain plaintext", async () => {
    const token = await adminToken();
    await app.request(
      "/api/ai/providers/anthropic",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "sk-ant-secret", model: "claude-haiku-4-5-20251001" }),
      },
      TEST_ENV
    );

    const row = await env.DB.prepare(
      "SELECT ciphertext FROM ai_provider_keys WHERE provider = 'anthropic'"
    ).first<{ ciphertext: string }>();

    expect(row).not.toBeNull();
    expect(row!.ciphertext).not.toBe("sk-ant-secret");
    expect(row!.ciphertext).not.toContain("sk-ant");
  });

  it("subsequent GET shows has_key=true after PUT", async () => {
    const token = await adminToken();
    await app.request(
      "/api/ai/providers/google",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "google-key-abc", model: "gemini-2.5-flash" }),
      },
      TEST_ENV
    );

    const getRes = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await getRes.json<{ providers: { provider: string; has_key: boolean }[] }>();
    const google = body.providers.find((p) => p.provider === "google");
    expect(google?.has_key).toBe(true);
  });

  it("rejects unknown provider id → 400", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/providers/unknown-provider",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "key", model: "model" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/providers/openai",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "sk-key", model: "gpt-4.1" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/ai/providers/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin can delete a provider key — subsequent GET shows has_key=false", async () => {
    const token = await adminToken();
    // First, store a key
    await app.request(
      "/api/ai/providers/deepgram",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: "dg-key", model: "nova-3" }),
      },
      TEST_ENV
    );

    // Then delete it
    const delRes = await app.request(
      "/api/ai/providers/deepgram",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(delRes.status).toBe(200);

    // GET should show has_key=false
    const getRes = await app.request(
      "/api/ai/providers",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await getRes.json<{ providers: { provider: string; has_key: boolean }[] }>();
    const dg = body.providers.find((p) => p.provider === "deepgram");
    expect(dg?.has_key).toBe(false);
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/providers/openai",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/ai/use-cases", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin gets all 5 use-case routing rows", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/use-cases",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ use_cases: { use_case: string; provider: string; model: string }[] }>();
    expect(Array.isArray(body.use_cases)).toBe(true);
    expect(body.use_cases).toHaveLength(5);
    const ucIds = body.use_cases.map((u) => u.use_case);
    expect(ucIds).toContain("doc_extract");
    expect(ucIds).toContain("vitals_parse");
    expect(ucIds).toContain("test_disambig");
    expect(ucIds).toContain("ref_range");
    expect(ucIds).toContain("voice_trans");
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/use-cases",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("PUT /api/ai/use-cases/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin can update use-case routing", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/use-cases/doc_extract",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", model: "gpt-4.1" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const getRes = await app.request(
      "/api/ai/use-cases",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await getRes.json<{ use_cases: { use_case: string; provider: string; model: string }[] }>();
    const row = body.use_cases.find((u) => u.use_case === "doc_extract");
    expect(row?.provider).toBe("openai");
    expect(row?.model).toBe("gpt-4.1");
  });

  it("rejects unknown use-case id → 400", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/use-cases/unknown_case",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", model: "gpt-4.1" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/use-cases/doc_extract",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "openai", model: "gpt-4.1" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/ai/gateway", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("returns empty gateway config when not set", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      // wrangler.toml [vars] sets AI_GATEWAY_URL to the production URL; override to "" to test the no-config path
      { ...TEST_ENV, AI_GATEWAY_URL: "" }
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ account_id: string | null; gateway_id: string | null }>();
    expect(body.account_id).toBeNull();
    expect(body.gateway_id).toBeNull();
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/ai/gateway — env var fallback", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("returns account_id and gateway_id parsed from AI_GATEWAY_URL when D1 has no values", async () => {
    const token = await adminToken();
    const envWithGateway = {
      ...env,
      JWT_SECRET,
      AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/cf-acct-abc123/family-health",
    };
    const res = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      envWithGateway
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ account_id: string; gateway_id: string; source: string }>();
    expect(body.account_id).toBe("cf-acct-abc123");
    expect(body.gateway_id).toBe("family-health");
    expect(body.source).toBe("env");
  });

  it("D1 values take precedence over AI_GATEWAY_URL env var", async () => {
    const token = await adminToken();
    // Save to D1 first
    await app.request(
      "/api/ai/gateway",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: "d1-acct", gateway_id: "d1-gw" }),
      },
      { ...env, JWT_SECRET }
    );
    // GET with env URL also set — D1 should win
    const envWithGateway = {
      ...env,
      JWT_SECRET,
      AI_GATEWAY_URL: "https://gateway.ai.cloudflare.com/v1/env-acct/env-gw",
    };
    const res = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      envWithGateway
    );
    const body = await res.json<{ account_id: string; gateway_id: string; source: string }>();
    expect(body.account_id).toBe("d1-acct");
    expect(body.gateway_id).toBe("d1-gw");
    expect(body.source).toBe("d1");
  });

  it("returns source=null with nulls when neither D1 nor env has gateway config", async () => {
    const token = await adminToken();
    const envNoGateway = { ...env, JWT_SECRET, AI_GATEWAY_URL: "" };
    const res = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      envNoGateway
    );
    const body = await res.json<{ account_id: null; gateway_id: null; source: null }>();
    expect(body.account_id).toBeNull();
    expect(body.gateway_id).toBeNull();
    expect(body.source).toBeNull();
  });
});

describe("PUT /api/ai/gateway", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
  });

  it("super admin can save gateway config and GET returns it", async () => {
    const token = await adminToken();
    const putRes = await app.request(
      "/api/ai/gateway",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: "cf-acct-123", gateway_id: "family-health" }),
      },
      TEST_ENV
    );
    expect(putRes.status).toBe(200);

    const getRes = await app.request(
      "/api/ai/gateway",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    const body = await getRes.json<{ account_id: string; gateway_id: string }>();
    expect(body.account_id).toBe("cf-acct-123");
    expect(body.gateway_id).toBe("family-health");
  });

  it("returns 403 for viewer", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/ai/gateway",
      {
        method: "PUT",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: "cf-acct", gateway_id: "gw" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});
