import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb } from "../helpers/setup-db";
import { hashPassword } from "../../src/services/crypto";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

const TEST_ENV = {
  ...env,
  JWT_SECRET,
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};

async function seedUser(db: D1Database, overrides?: {
  id?: string;
  email?: string;
  display_name?: string;
  role?: string;
}) {
  const id = overrides?.id ?? "user-1";
  const email = overrides?.email ?? "user@test.com";
  const display_name = overrides?.display_name ?? "Test User";
  const role = overrides?.role ?? "admin";
  const hash = await hashPassword("securepassword123");
  await db.prepare(
    `INSERT INTO users (id, email, password_hash, role, display_name, is_super_admin)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).bind(id, email, hash, role, display_name).run();
  return { id, email, display_name, role };
}

describe("PUT /api/auth/me", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedUser(env.DB);
  });

  it("valid token + valid body → 200 with updated user", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/me",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ display_name: "Updated Name", email: "updated@test.com" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.user.display_name).toBe("Updated Name");
    expect(body.user.email).toBe("updated@test.com");
    expect(body.user.id).toBe("user-1");
    expect(body.user.role).toBe("admin");

    const row = await env.DB.prepare("SELECT display_name, email FROM users WHERE id = ?")
      .bind("user-1").first<{ display_name: string; email: string }>();
    expect(row?.display_name).toBe("Updated Name");
    expect(row?.email).toBe("updated@test.com");
  });

  it("email taken by another user → 409", async () => {
    await seedUser(env.DB, { id: "user-2", email: "other@test.com", display_name: "Other" });
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/me",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ email: "other@test.com" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(409);
    const body = await res.json<any>();
    expect(body.error).toMatch(/taken/i);
  });

  it("no auth token → 401", async () => {
    const res = await app.request(
      "/api/auth/me",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: "Anon" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(401);
  });

  it("invalid email format → 400", async () => {
    const token = await createAccessToken(
      { sub: "user-1", role: "admin", email: "user@test.com" },
      JWT_SECRET
    );
    const res = await app.request(
      "/api/auth/me",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Cookie: `access_token=${token}`,
        },
        body: JSON.stringify({ email: "not-an-email" }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toMatch(/email/i);
  });
});
