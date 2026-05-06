import { Hono } from "hono";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { hashPassword, verifyPassword, sha256hex } from "../services/crypto";
import { createAccessToken } from "../services/jwt";
import { verifyTurnstileToken } from "../services/turnstile";
import { authMiddleware } from "../middleware/auth";
import type { Bindings } from "../types";
import type { DecodedToken } from "../services/jwt";

type Variables = { user: DecodedToken };

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;
const ACCESS_TOKEN_EXPIRY = 900; // 15 min
const REFRESH_TOKEN_DAYS = 7;
const REFRESH_TOKEN_DAYS_REMEMBER = 30;

export const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

authRoutes.post("/login", async (c) => {
  const { email, password, turnstileToken, remember = false } = await c.req.json<{
    email: string; password: string; turnstileToken: string; remember?: boolean;
  }>();

  // 1. Verify Turnstile
  const ip = c.req.header("CF-Connecting-IP") ?? "";
  if (!await verifyTurnstileToken(turnstileToken, c.env.TURNSTILE_SECRET_KEY, ip)) {
    return c.json({ error: "Bot verification failed" }, 403);
  }

  // 2. Find user
  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, role, display_name, is_super_admin, must_change_pw, failed_attempts, locked_until FROM users WHERE email = ?"
  ).bind(email).first<{
    id: string; email: string; password_hash: string; role: string;
    display_name: string; is_super_admin: number; must_change_pw: number;
    failed_attempts: number; locked_until: string | null;
  }>();
  if (!user) return c.json({ error: "Invalid credentials" }, 401);

  // 3. Check lockout
  if (user.locked_until) {
    const lockExpiry = new Date(user.locked_until).getTime();
    if (Date.now() < lockExpiry) {
      return c.json({ error: "Account locked" }, 423);
    }
    // Lock expired — reset
    await c.env.DB.prepare(
      "UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = ?"
    ).bind(user.id).run();
  }

  // 4. Verify password
  if (!await verifyPassword(password, user.password_hash)) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= LOCKOUT_THRESHOLD) {
      const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
      await c.env.DB.prepare(
        "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?"
      ).bind(attempts, lockUntil, user.id).run();
      return c.json({ error: "Account locked" }, 423);
    }
    await c.env.DB.prepare(
      "UPDATE users SET failed_attempts = ? WHERE id = ?"
    ).bind(attempts, user.id).run();
    return c.json({ error: "Invalid credentials" }, 401);
  }

  // 5. Reset failed attempts
  await c.env.DB.prepare(
    "UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?"
  ).bind(user.id).run();

  // 6. Issue tokens
  const refreshDays = remember ? REFRESH_TOKEN_DAYS_REMEMBER : REFRESH_TOKEN_DAYS;
  const accessToken = await createAccessToken(
    { sub: user.id, role: user.role, email: user.email }, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRY
  );
  const refreshTokenRaw = crypto.randomUUID();
  const refreshHash = await sha256hex(refreshTokenRaw);
  const refreshExpiry = new Date(Date.now() + refreshDays * 86400_000).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, long_session) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), user.id, refreshHash, refreshExpiry, remember ? 1 : 0).run();
  setCookie(c, "access_token", accessToken, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: ACCESS_TOKEN_EXPIRY,
  });
  setCookie(c, "refresh_token", refreshTokenRaw, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/api/auth", maxAge: refreshDays * 86400,
  });

  return c.json({
    user: { id: user.id, email: user.email, role: user.role, display_name: user.display_name },
    must_change_pw: !!user.must_change_pw,
  });
});

authRoutes.post("/logout", async (c) => {
  const refreshTokenRaw = getCookie(c, "refresh_token");
  if (refreshTokenRaw) {
    const hash = await sha256hex(refreshTokenRaw);
    await c.env.DB.prepare(
      "UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?"
    ).bind(hash).run();
  }
  deleteCookie(c, "access_token", { path: "/" });
  deleteCookie(c, "refresh_token", { path: "/api/auth" });
  return c.json({ ok: true });
});

authRoutes.post("/refresh", async (c) => {
  const refreshTokenRaw = getCookie(c, "refresh_token");
  if (!refreshTokenRaw) return c.json({ error: "No refresh token" }, 401);

  const hash = await sha256hex(refreshTokenRaw);
  const row = await c.env.DB.prepare(
    "SELECT id, user_id, revoked, expires_at, long_session FROM refresh_tokens WHERE token_hash = ?"
  ).bind(hash).first<{ id: string; user_id: string; revoked: number; expires_at: string; long_session: number }>();

  if (!row) return c.json({ error: "Invalid refresh token" }, 401);

  // Theft detection: reused token → revoke ALL for this user
  if (row.revoked) {
    await c.env.DB.prepare(
      "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?"
    ).bind(row.user_id).run();
    deleteCookie(c, "access_token", { path: "/" });
    deleteCookie(c, "refresh_token", { path: "/api/auth" });
    return c.json({ error: "Token reuse detected — all sessions revoked" }, 401);
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return c.json({ error: "Refresh token expired" }, 401);
  }

  // Revoke old, issue new
  await c.env.DB.prepare(
    "UPDATE refresh_tokens SET revoked = 1 WHERE id = ?"
  ).bind(row.id).run();

  const user = await c.env.DB.prepare(
    "SELECT id, email, role FROM users WHERE id = ?"
  ).bind(row.user_id).first<{ id: string; email: string; role: string }>();
  if (!user) return c.json({ error: "User not found" }, 401);

  const longSession = row.long_session;
  const refreshDays = longSession ? REFRESH_TOKEN_DAYS_REMEMBER : REFRESH_TOKEN_DAYS;
  const accessToken = await createAccessToken(
    { sub: user.id, role: user.role, email: user.email }, c.env.JWT_SECRET, ACCESS_TOKEN_EXPIRY
  );
  const newRefreshRaw = crypto.randomUUID();
  const newRefreshHash = await sha256hex(newRefreshRaw);
  const refreshExpiry = new Date(Date.now() + refreshDays * 86400_000).toISOString();
  await c.env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, long_session) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), user.id, newRefreshHash, refreshExpiry, longSession).run();
  setCookie(c, "access_token", accessToken, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: ACCESS_TOKEN_EXPIRY,
  });
  setCookie(c, "refresh_token", newRefreshRaw, {
    httpOnly: true, secure: true, sameSite: "Lax", path: "/api/auth", maxAge: refreshDays * 86400,
  });

  return c.json({ ok: true });
});

authRoutes.post("/change-password", authMiddleware, async (c) => {
  const user = c.get("user");
  const { old_password, new_password } = await c.req.json<{ old_password: string; new_password: string }>();

  if (new_password.length < 12) return c.json({ error: "Password must be at least 12 characters" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ?"
  ).bind(user.sub).first<{ password_hash: string }>();
  if (!row || !await verifyPassword(old_password, row.password_hash)) {
    return c.json({ error: "Invalid current password" }, 401);
  }

  const newHash = await hashPassword(new_password);
  await c.env.DB.prepare(
    "UPDATE users SET password_hash = ?, must_change_pw = 0, updated_at = datetime('now') WHERE id = ?"
  ).bind(newHash, user.sub).run();

  // Revoke all refresh tokens
  await c.env.DB.prepare(
    "UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?"
  ).bind(user.sub).run();

  return c.json({ ok: true });
});

authRoutes.get("/me", authMiddleware, async (c) => {
  const jwt = c.get("user");
  const user = await c.env.DB.prepare(
    "SELECT id, email, role, display_name, is_super_admin, must_change_pw FROM users WHERE id = ?"
  ).bind(jwt.sub).first();
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user });
});
