import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedViewer, seedPatient } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = { ...env, JWT_SECRET };

async function adminToken(id = "admin-1", email = "admin@test.com") {
  return createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
}

async function viewerToken(id = "viewer-1", email = "viewer@test.com") {
  return createAccessToken({ sub: id, role: "viewer", email }, JWT_SECRET);
}

describe("POST /api/share-links", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedViewer(env.DB);
    await seedPatient(env.DB);
  });

  it("admin can create a share link → 201 with token and link", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/share-links",
      {
        method: "POST",
        headers: {
          Cookie: `access_token=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ patient_ids: ["patient-1"], expires_in_days: 7 }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe("string");
    expect(body.link).toMatch(/^\/share\//);
    expect(body.id).toBeTruthy();
    expect(body.expires_at).toBeTruthy();
  });

  it("admin can create a link with no expiry (null expires_in_days) → 201 with expires_at null", async () => {
    const token = await adminToken();
    const res = await app.request(
      "/api/share-links",
      {
        method: "POST",
        headers: { Cookie: `access_token=${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ patient_ids: ["patient-1"], expires_in_days: null }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(201);
    const body = await res.json<any>();
    expect(body.expires_at).toBeNull();
    expect(body.link).toMatch(/^\/share\//);

    // Confirm the link is accessible (not expired)
    const getRes = await app.request(`/api/share/${body.token}`, {}, TEST_ENV);
    expect(getRes.status).toBe(200);
  });

  it("viewer creating a share link → 403", async () => {
    const token = await viewerToken();
    const res = await app.request(
      "/api/share-links",
      {
        method: "POST",
        headers: {
          Cookie: `access_token=${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ patient_ids: ["patient-1"], expires_in_days: 7 }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/share/:token", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("valid unexpired token → 200 with patient summary", async () => {
    const rawToken = "valid-raw-token-abc123";
    const tokenHash = await sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-valid', ?, '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(tokenHash, expiresAt).run();

    const res = await app.request(`/api/share/${rawToken}`, {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(body.patient).toBeTruthy();
  });

  it("expired token → 410", async () => {
    const rawToken = "expired-raw-token-xyz";
    const tokenHash = await sha256hex(rawToken);
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-expired', ?, '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(tokenHash, expiresAt).run();

    const res = await app.request(`/api/share/${rawToken}`, {}, TEST_ENV);
    expect(res.status).toBe(410);
  });

  it("revoked token → 404", async () => {
    const rawToken = "revoked-raw-token-xyz";
    const tokenHash = await sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by, revoked_at)
       VALUES ('sl-revoked', ?, '["patient-1"]', '["read"]', ?, 'admin-1', datetime('now'))`
    ).bind(tokenHash, expiresAt).run();

    const res = await app.request(`/api/share/${rawToken}`, {}, TEST_ENV);
    expect(res.status).toBe(404);
  });

  it("unknown token → 404", async () => {
    const res = await app.request("/api/share/does-not-exist", {}, TEST_ENV);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/share-links/:id", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("admin can revoke a link and subsequent GET returns 404", async () => {
    const rawToken = "link-to-revoke-token";
    const tokenHash = await sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-revoke-me', ?, '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(tokenHash, expiresAt).run();

    const token = await adminToken();
    const delRes = await app.request(
      "/api/share-links/sl-revoke-me",
      { method: "DELETE", headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(delRes.status).toBe(200);

    const getRes = await app.request(`/api/share/${rawToken}`, {}, TEST_ENV);
    expect(getRes.status).toBe(404);
  });
});

describe("GET /api/share-links", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("admin can list their share links", async () => {
    const rawToken = "list-test-token";
    const tokenHash = await sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await env.DB.prepare(
      `INSERT INTO share_links (id, token_hash, patient_ids, scopes, expires_at, created_by)
       VALUES ('sl-list-1', ?, '["patient-1"]', '["read"]', ?, 'admin-1')`
    ).bind(tokenHash, expiresAt).run();

    const token = await adminToken();
    const res = await app.request(
      "/api/share-links",
      { headers: { Cookie: `access_token=${token}` } },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const body = await res.json<any>();
    expect(Array.isArray(body.links)).toBe(true);
    expect(body.links.length).toBeGreaterThan(0);
  });
});
