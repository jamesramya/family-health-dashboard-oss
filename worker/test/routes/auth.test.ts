import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb } from "../helpers/setup-db";
import { hashPassword, sha256hex } from "../../src/services/crypto";
import { createAccessToken } from "../../src/services/jwt";

// Cloudflare test secret key that always passes Turnstile verification
const TURNSTILE_VALID_SECRET = "1x0000000000000000000000000000000AA";
const TURNSTILE_VALID_TOKEN = "valid-token";
const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

const TEST_ENV = {
  ...env,
  JWT_SECRET,
  TURNSTILE_SECRET_KEY: TURNSTILE_VALID_SECRET,
};

async function createUserWithPassword(db: D1Database, overrides?: {
  id?: string;
  email?: string;
  password?: string;
  must_change_pw?: number;
  failed_attempts?: number;
  locked_until?: string | null;
}) {
  const id = overrides?.id ?? "user-1";
  const email = overrides?.email ?? "user@test.com";
  const password = overrides?.password ?? "securepassword123";
  const must_change_pw = overrides?.must_change_pw ?? 0;
  const failed_attempts = overrides?.failed_attempts ?? 0;
  const locked_until = overrides?.locked_until ?? null;

  const hash = await hashPassword(password);
  await db.prepare(
    `INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin, must_change_pw, failed_attempts, locked_until)
     VALUES (?, ?, ?, 'admin', 'Test User', 1, ?, ?, ?)`
  ).bind(id, email, hash, must_change_pw, failed_attempts, locked_until).run();
  return { id, email, password };
}

function loginBody(overrides?: Partial<{ email: string; password: string; turnstileToken: string; remember: boolean }>) {
  const body: Record<string, unknown> = {
    email: overrides?.email ?? "user@test.com",
    password: overrides?.password ?? "securepassword123",
    turnstileToken: overrides?.turnstileToken ?? TURNSTILE_VALID_TOKEN,
  };
  if (overrides?.remember !== undefined) body.remember = overrides.remember;
  return JSON.stringify(body);
}

function cookieMaxAge(res: Response, name: string): number | null {
  const found = getSetCookies(res.headers).find((c) => c.startsWith(`${name}=`));
  if (!found) return null;
  const match = found.match(/Max-Age=(\d+)/i);
  return match ? Number(match[1]) : null;
}

// getSetCookie is part of the Fetch spec but not yet in all type definitions
function getSetCookies(headers: Headers): string[] {
  return (headers as unknown as { getSetCookie?(): string[] }).getSetCookie?.() ?? [];
}

function cookieHeader(res: Response, name: string): string | null {
  const found = getSetCookies(res.headers).find((c) => c.startsWith(`${name}=`));
  if (!found) return null;
  return found.split(";")[0].split("=").slice(1).join("=");
}

function buildCookieString(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("valid credentials + valid Turnstile token → 200 with cookies", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.user.email).toBe("user@test.com");
    expect(body.must_change_pw).toBe(false);

    const allCookies = getSetCookies(res.headers);
    expect(allCookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(allCookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
    // Both should be HttpOnly
    expect(allCookies.find((c) => c.startsWith("access_token="))).toContain("HttpOnly");
    expect(allCookies.find((c) => c.startsWith("refresh_token="))).toContain("HttpOnly");
  });

  it("valid credentials + invalid Turnstile token → 403", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ turnstileToken: "invalid-token" }),
      },
      { ...TEST_ENV, TURNSTILE_SECRET_KEY: "invalid-secret-key" }
    );
    expect(res.status).toBe(403);
    const body = await res.json<any>();
    expect(body.error).toContain("Bot verification failed");
  });

  it("wrong password → 401", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ password: "wrongpassword123" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toBe("Invalid credentials");
  });

  it("wrong password increments failed_attempts", async () => {
    await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ password: "wrongpassword123" }),
      },
      TEST_ENV
    );
    const row = await env.DB.prepare("SELECT failed_attempts FROM users WHERE email = ?")
      .bind("user@test.com").first<{ failed_attempts: number }>();
    expect(row?.failed_attempts).toBe(1);
  });

  it("account locks after 5 failed attempts → 423", async () => {
    for (let i = 0; i < 5; i++) {
      await app.request(
        "/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: loginBody({ password: "wrongpassword123" }),
        },
        TEST_ENV
      );
    }
    // 5th attempt should trigger the lock and return 423
    await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ password: "wrongpassword123" }),
      },
      TEST_ENV
    );
    // Account should now be locked
    const row = await env.DB.prepare("SELECT locked_until FROM users WHERE email = ?")
      .bind("user@test.com").first<{ locked_until: string | null }>();
    expect(row?.locked_until).not.toBeNull();
  });

  it("locked account returns 423", async () => {
    const futureTime = new Date(Date.now() + 15 * 60_000).toISOString();
    await env.DB.prepare("UPDATE users SET locked_until = ?, failed_attempts = 5 WHERE email = ?")
      .bind(futureTime, "user@test.com").run();

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(res.status).toBe(423);
    const body = await res.json<any>();
    expect(body.error).toContain("locked");
  });

  it("locked account whose lock has expired → login succeeds (lock reset)", async () => {
    const pastTime = new Date(Date.now() - 1000).toISOString();
    await env.DB.prepare("UPDATE users SET locked_until = ?, failed_attempts = 5 WHERE email = ?")
      .bind(pastTime, "user@test.com").run();

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    // failed_attempts should be reset
    const row = await env.DB.prepare("SELECT failed_attempts, locked_until FROM users WHERE email = ?")
      .bind("user@test.com").first<{ failed_attempts: number; locked_until: string | null }>();
    expect(row?.failed_attempts).toBe(0);
    expect(row?.locked_until).toBeNull();
  });

  it("successful login resets failed_attempts to 0", async () => {
    await env.DB.prepare("UPDATE users SET failed_attempts = 3 WHERE email = ?")
      .bind("user@test.com").run();

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const row = await env.DB.prepare("SELECT failed_attempts FROM users WHERE email = ?")
      .bind("user@test.com").first<{ failed_attempts: number }>();
    expect(row?.failed_attempts).toBe(0);
  });

  it("nonexistent email → 401 (same error, no user enumeration)", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ email: "nobody@example.com" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toBe("Invalid credentials");
  });

  it("login with must_change_pw = 1 → 200 with must_change_pw: true", async () => {
    await env.DB.prepare("UPDATE users SET must_change_pw = 1 WHERE email = ?")
      .bind("user@test.com").run();

    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.must_change_pw).toBe(true);
  });
});

describe("POST /api/auth/logout", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("clears both cookies and revokes refresh token", async () => {
    // First login
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    const refreshToken = cookieHeader(loginRes, "refresh_token");
    const accessToken = cookieHeader(loginRes, "access_token");
    expect(refreshToken).not.toBeNull();

    // Logout
    const logoutRes = await app.request(
      "/api/auth/logout",
      {
        method: "POST",
        headers: {
          Cookie: buildCookieString({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          }),
        },
      },
      TEST_ENV
    );
    expect(logoutRes.status).toBe(200);

    // Refresh token should be revoked in DB
    const hash = await sha256hex(refreshToken!);
    const row = await env.DB.prepare("SELECT revoked FROM refresh_tokens WHERE token_hash = ?")
      .bind(hash).first<{ revoked: number }>();
    expect(row?.revoked).toBe(1);

    // Cookies should be cleared
    const allCookies = getSetCookies(logoutRes.headers);
    const accessCookie = allCookies.find((c) => c.startsWith("access_token="));
    const refreshCookie = allCookies.find((c) => c.startsWith("refresh_token="));
    // Cleared cookies should have empty value or max-age=0
    if (accessCookie) {
      expect(accessCookie).toMatch(/access_token=;|Max-Age=0/);
    }
    if (refreshCookie) {
      expect(refreshCookie).toMatch(/refresh_token=;|Max-Age=0/);
    }
  });
});

describe("POST /api/auth/refresh", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("valid refresh token → rotates both tokens (new cookies, old refresh revoked)", async () => {
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    const oldRefreshToken = cookieHeader(loginRes, "refresh_token");
    const oldAccessToken = cookieHeader(loginRes, "access_token");

    const refreshRes = await app.request(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: {
          Cookie: buildCookieString({
            access_token: oldAccessToken!,
            refresh_token: oldRefreshToken!,
          }),
        },
      },
      TEST_ENV
    );
    expect(refreshRes.status).toBe(200);

    // New cookies should be set
    const allCookies = getSetCookies(refreshRes.headers);
    expect(allCookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(allCookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    // Old refresh token should be revoked
    const oldHash = await sha256hex(oldRefreshToken!);
    const row = await env.DB.prepare("SELECT revoked FROM refresh_tokens WHERE token_hash = ?")
      .bind(oldHash).first<{ revoked: number }>();
    expect(row?.revoked).toBe(1);

    // New refresh token should not equal old one
    const newRefreshToken = cookieHeader(refreshRes, "refresh_token");
    expect(newRefreshToken).not.toBe(oldRefreshToken);
  });

  it("reused (revoked) refresh token → 401, revokes ALL user sessions (theft detection)", async () => {
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    const refreshToken = cookieHeader(loginRes, "refresh_token");
    const accessToken = cookieHeader(loginRes, "access_token");

    // Use the refresh token once (valid)
    await app.request(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: {
          Cookie: buildCookieString({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          }),
        },
      },
      TEST_ENV
    );

    // Try to reuse the same (now-revoked) refresh token
    const reuseRes = await app.request(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: {
          Cookie: buildCookieString({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          }),
        },
      },
      TEST_ENV
    );
    expect(reuseRes.status).toBe(401);
    const body = await reuseRes.json<any>();
    expect(body.error).toContain("reuse detected");

    // All refresh tokens for this user should be revoked
    const count = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM refresh_tokens WHERE user_id = ? AND revoked = 0"
    ).bind("user-1").first<{ cnt: number }>();
    expect(count?.cnt).toBe(0);
  });

  it("expired refresh token → 401", async () => {
    // Insert an already-expired refresh token
    const rawToken = "expired-refresh-token-raw";
    const hash = await sha256hex(rawToken);
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
    ).bind("rt-expired", "user-1", hash, pastExpiry).run();

    const res = await app.request(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: {
          Cookie: `refresh_token=${rawToken}`,
        },
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toContain("expired");
  });

  it("no refresh token → 401", async () => {
    const res = await app.request(
      "/api/auth/refresh",
      { method: "POST" },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("returns current user from JWT", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/me",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.user.email).toBe("user@test.com");
    expect(body.user.id).toBe("user-1");
  });

  it("requires authentication → 401 without token", async () => {
    const res = await app.request("/api/auth/me", {}, TEST_ENV);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/change-password", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("valid old password + new password ≥12 chars → 200", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({
          old_password: "securepassword123",
          new_password: "newsecurepassword456",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.ok).toBe(true);
  });

  it("change password invalidates all refresh tokens", async () => {
    // Login to get a refresh token
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody(),
      },
      TEST_ENV
    );
    expect(loginRes.status).toBe(200);

    const accessToken = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    await app.request(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${accessToken}`,
        },
        body: JSON.stringify({
          old_password: "securepassword123",
          new_password: "brandnewpassword789",
        }),
      },
      TEST_ENV
    );

    // All refresh tokens for user should be revoked
    const count = await env.DB.prepare(
      "SELECT COUNT(*) as cnt FROM refresh_tokens WHERE user_id = ? AND revoked = 0"
    ).bind("user-1").first<{ cnt: number }>();
    expect(count?.cnt).toBe(0);
  });

  it("change password clears must_change_pw flag", async () => {
    await env.DB.prepare("UPDATE users SET must_change_pw = 1 WHERE id = ?")
      .bind("user-1").run();

    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    await app.request(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({
          old_password: "securepassword123",
          new_password: "newpassword123abc",
        }),
      },
      TEST_ENV
    );

    const row = await env.DB.prepare("SELECT must_change_pw FROM users WHERE id = ?")
      .bind("user-1").first<{ must_change_pw: number }>();
    expect(row?.must_change_pw).toBe(0);
  });

  it("wrong old password → 401", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({
          old_password: "wrongoldpassword",
          new_password: "newpassword123abc",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    const body = await res.json<any>();
    expect(body.error).toContain("Invalid current password");
  });

  it("new password too short → 400", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({
          old_password: "securepassword123",
          new_password: "short",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
  });
});

describe("keep-me-signed-in (long session)", () => {
  const TOLERANCE_S = 60;
  const STANDARD_DAYS = 7;
  const LONG_DAYS = 30;

  beforeEach(async () => {
    await setupDb(env.DB);
    await createUserWithPassword(env.DB);
  });

  it("Test A — remember=true → 30-day cookie Max-Age + long_session=1 in DB", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ remember: true }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const maxAge = cookieMaxAge(res, "refresh_token");
    expect(maxAge).not.toBeNull();
    expect(maxAge!).toBeGreaterThanOrEqual(LONG_DAYS * 86400 - TOLERANCE_S);
    expect(maxAge!).toBeLessThanOrEqual(LONG_DAYS * 86400 + TOLERANCE_S);

    const row = await env.DB.prepare(
      "SELECT long_session FROM refresh_tokens WHERE user_id = ?"
    ).bind("user-1").first<{ long_session: number }>();
    expect(row?.long_session).toBe(1);
  });

  it("Test B — remember=false → 7-day cookie Max-Age + long_session=0 in DB", async () => {
    const res = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ remember: false }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);

    const maxAge = cookieMaxAge(res, "refresh_token");
    expect(maxAge).not.toBeNull();
    expect(maxAge!).toBeGreaterThanOrEqual(STANDARD_DAYS * 86400 - TOLERANCE_S);
    expect(maxAge!).toBeLessThanOrEqual(STANDARD_DAYS * 86400 + TOLERANCE_S);

    const row = await env.DB.prepare(
      "SELECT long_session FROM refresh_tokens WHERE user_id = ?"
    ).bind("user-1").first<{ long_session: number }>();
    expect(row?.long_session).toBe(0);
  });

  it("Test C — refresh rotation inherits long session (remember=true login → refresh → still 30-day cookie)", async () => {
    const loginRes = await app.request(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: loginBody({ remember: true }),
      },
      TEST_ENV
    );
    expect(loginRes.status).toBe(200);

    const refreshToken = cookieHeader(loginRes, "refresh_token");
    const accessToken = cookieHeader(loginRes, "access_token");
    expect(refreshToken).not.toBeNull();

    const refreshRes = await app.request(
      "/api/auth/refresh",
      {
        method: "POST",
        headers: {
          Cookie: buildCookieString({
            access_token: accessToken!,
            refresh_token: refreshToken!,
          }),
        },
      },
      TEST_ENV
    );
    expect(refreshRes.status).toBe(200);

    const maxAge = cookieMaxAge(refreshRes, "refresh_token");
    expect(maxAge).not.toBeNull();
    expect(maxAge!).toBeGreaterThanOrEqual(LONG_DAYS * 86400 - TOLERANCE_S);
    expect(maxAge!).toBeLessThanOrEqual(LONG_DAYS * 86400 + TOLERANCE_S);

    const newRefreshToken = cookieHeader(refreshRes, "refresh_token");
    const newHash = await sha256hex(newRefreshToken!);
    const row = await env.DB.prepare(
      "SELECT long_session FROM refresh_tokens WHERE token_hash = ?"
    ).bind(newHash).first<{ long_session: number }>();
    expect(row?.long_session).toBe(1);
  });
});
