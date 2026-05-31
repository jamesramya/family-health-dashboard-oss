import { Hono } from "hono";
import type { Bindings } from "../types";
import { requireSuperAdmin } from "../middleware/role";
import { encryptKey, ENV_KEY, parseGatewayUrl, PROVIDER_IDS, USE_CASE_IDS } from "../services/ai-resolver";

type Variables = {
  user: { sub: string; role: string; email: string };
};

export const aiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

aiRoutes.get("/capabilities", (c) => {
  return c.json({
    google: !!c.env.GOOGLE_API_KEY,
    openai: !!c.env.OPENAI_API_KEY,
    anthropic: !!c.env.ANTHROPIC_API_KEY,
    deepgram: !!c.env.DEEPGRAM_API_KEY,
  });
});

// ── All routes below require super admin ────────────────────────────────────

aiRoutes.use("/providers", requireSuperAdmin);
aiRoutes.use("/providers/*", requireSuperAdmin);
aiRoutes.use("/use-cases", requireSuperAdmin);
aiRoutes.use("/use-cases/*", requireSuperAdmin);
aiRoutes.use("/gateway", requireSuperAdmin);

// GET /api/ai/providers — list all 9 providers with has_key, source, and model
aiRoutes.get("/providers", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT provider, model FROM ai_provider_keys"
  ).all<{ provider: string; model: string }>();

  const storedMap = new Map(rows.results.map((r) => [r.provider, r.model]));

  const providers = PROVIDER_IDS.map((id) => {
    if (storedMap.has(id)) {
      return { provider: id, has_key: true, source: "d1" as const, model: storedMap.get(id) ?? null };
    }
    const envKey = ENV_KEY[id];
    const hasEnvKey = envKey ? Boolean(c.env[envKey]) : false;
    if (hasEnvKey) {
      return { provider: id, has_key: true, source: "env" as const, model: null };
    }
    return { provider: id, has_key: false, source: null, model: null };
  });

  return c.json({ providers });
});

// PUT /api/ai/providers/:id — upsert encrypted key
aiRoutes.put("/providers/:id", async (c) => {
  const id = c.req.param("id");
  if (!(PROVIDER_IDS as readonly string[]).includes(id)) {
    return c.json({ error: "Unknown provider" }, 400);
  }

  const body = await c.req.json<{ api_key: string; model: string }>();
  if (!body.api_key || !body.model) {
    return c.json({ error: "api_key and model are required" }, 400);
  }

  const user = c.get("user");
  const { ciphertext, iv } = await encryptKey(body.api_key, c.env.JWT_SECRET);

  await c.env.DB.prepare(
    `INSERT INTO ai_provider_keys (provider, ciphertext, iv, model, updated_at, updated_by)
     VALUES (?, ?, ?, ?, datetime('now'), ?)
     ON CONFLICT(provider) DO UPDATE SET
       ciphertext = excluded.ciphertext,
       iv = excluded.iv,
       model = excluded.model,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  )
    .bind(id, ciphertext, iv, body.model, user.sub)
    .run();

  return c.json({ ok: true });
});

// DELETE /api/ai/providers/:id — remove key
aiRoutes.delete("/providers/:id", async (c) => {
  const id = c.req.param("id");
  if (!(PROVIDER_IDS as readonly string[]).includes(id)) {
    return c.json({ error: "Unknown provider" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM ai_provider_keys WHERE provider = ?")
    .bind(id)
    .run();

  return c.json({ ok: true });
});

// GET /api/ai/use-cases — list all routing rows
aiRoutes.get("/use-cases", async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT use_case, provider, model FROM ai_use_case_routing ORDER BY use_case"
  ).all<{ use_case: string; provider: string; model: string }>();

  return c.json({ use_cases: rows.results });
});

// PUT /api/ai/use-cases/:id — upsert routing
aiRoutes.put("/use-cases/:id", async (c) => {
  const id = c.req.param("id");
  if (!(USE_CASE_IDS as readonly string[]).includes(id)) {
    return c.json({ error: "Unknown use case" }, 400);
  }

  const body = await c.req.json<{ provider: string; model: string }>();
  if (!body.provider || !body.model) {
    return c.json({ error: "provider and model are required" }, 400);
  }

  const user = c.get("user");

  await c.env.DB.prepare(
    `INSERT INTO ai_use_case_routing (use_case, provider, model, updated_at, updated_by)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(use_case) DO UPDATE SET
       provider = excluded.provider,
       model = excluded.model,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`
  )
    .bind(id, body.provider, body.model, user.sub)
    .run();

  return c.json({ ok: true });
});

// GET /api/ai/gateway — read account_id + gateway_id; D1 wins, then AI_GATEWAY_URL env fallback
aiRoutes.get("/gateway", async (c) => {
  const acct = await c.env.DB.prepare(
    "SELECT value FROM system_settings WHERE key = 'ai.gateway.account_id'"
  ).first<{ value: string }>();

  const gw = await c.env.DB.prepare(
    "SELECT value FROM system_settings WHERE key = 'ai.gateway.gateway_id'"
  ).first<{ value: string }>();

  if (acct?.value && gw?.value) {
    return c.json({ account_id: acct.value, gateway_id: gw.value, source: "d1" });
  }

  const fromEnv = parseGatewayUrl(c.env.AI_GATEWAY_URL);
  if (fromEnv) {
    return c.json({ account_id: fromEnv.account_id, gateway_id: fromEnv.gateway_id, source: "env" });
  }

  return c.json({ account_id: null, gateway_id: null, source: null });
});

// PUT /api/ai/gateway — upsert both system_settings keys
aiRoutes.put("/gateway", async (c) => {
  const body = await c.req.json<{ account_id: string; gateway_id: string }>();
  if (!body.account_id || !body.gateway_id) {
    return c.json({ error: "account_id and gateway_id are required" }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('ai.gateway.account_id', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(body.account_id)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO system_settings (key, value, updated_at) VALUES ('ai.gateway.gateway_id', ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  )
    .bind(body.gateway_id)
    .run();

  return c.json({ ok: true });
});
