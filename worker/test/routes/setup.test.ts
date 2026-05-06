import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin } from "../helpers/setup-db";

const TEST_ENV = {
  ...env,
  JWT_SECRET: "test-jwt-secret-key-must-be-at-least-32-chars",
  TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
};

describe("POST /api/setup", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
  });

  it("creates super admin when zero users exist → 201", async () => {
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "securepassword123",
          display_name: "Admin User",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.user.email).toBe("admin@example.com");
    expect(body.user.role).toBe("admin");
    expect(body.user.is_super_admin).toBe(true);
    expect(body.api_key).toBeDefined();
    expect(typeof body.api_key).toBe("string");
    expect(body.api_key.length).toBeGreaterThan(0);
    expect(body.message).toContain("not be shown again");
  });

  it("returns 403 when users already exist", async () => {
    await seedAdmin(env.DB);
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "second@example.com",
          password: "securepassword123",
          display_name: "Second Admin",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
    const body = await res.json<any>();
    expect(body.error).toBeDefined();
  });

  it("validates 12-char minimum password → 400", async () => {
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "short",
          display_name: "Admin User",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toContain("12 characters");
  });

  it("validates required field email → 400", async () => {
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: "securepassword123",
          display_name: "Admin User",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toBeDefined();
  });

  it("validates required field password → 400", async () => {
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          display_name: "Admin User",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toBeDefined();
  });

  it("validates required field display_name → 400", async () => {
    const res = await app.request(
      "/api/setup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@example.com",
          password: "securepassword123",
          turnstile_token: "test-token",
        }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<any>();
    expect(body.error).toBeDefined();
  });
});
