import { Hono } from "hono";
import { hashPassword, sha256hex } from "../services/crypto";
import { verifyTurnstileToken } from "../services/turnstile";
import type { Bindings } from "../types";

export const setupRoutes = new Hono<{ Bindings: Bindings }>();

setupRoutes.get("/setup", async (c) => {
  const count = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  return c.json({ setup_complete: !!(count && count.cnt > 0) });
});

setupRoutes.post("/setup", async (c) => {
  const count = await c.env.DB.prepare("SELECT COUNT(*) as cnt FROM users").first<{ cnt: number }>();
  if (count && count.cnt > 0) return c.json({ error: "Setup already completed" }, 403);

  const body = await c.req.json<{ email: string; password: string; display_name: string; turnstile_token: string }>();

  const ip = c.req.header("CF-Connecting-IP");
  const turnstileOk = await verifyTurnstileToken(body.turnstile_token ?? "", c.env.TURNSTILE_SECRET_KEY, ip);
  if (!turnstileOk) return c.json({ error: "Turnstile verification failed" }, 403);

  if (!body.email || !body.password || !body.display_name)
    return c.json({ error: "email, password, and display_name required" }, 400);
  if (body.password.length < 12)
    return c.json({ error: "Password must be at least 12 characters" }, 400);

  const userId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin) VALUES (?, ?, ?, 'admin', ?, 1)"
  ).bind(userId, body.email, await hashPassword(body.password), body.display_name).run();

  // Generate backup API key
  const apiKey = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
  await c.env.DB.prepare(
    "INSERT INTO system_settings (key, value) VALUES ('backup_api_key_hash', ?)"
  ).bind(await sha256hex(apiKey)).run();

  return c.json({
    user: { id: userId, email: body.email, role: "admin", display_name: body.display_name, is_super_admin: true },
    api_key: apiKey,
    message: "Save this API key — it will not be shown again.",
  }, 201);
});
