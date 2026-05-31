import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient, seedOAuthClient, seedPat } from "../helpers/setup-db";
import { createAccessToken } from "../../src/services/jwt";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";
const TEST_ENV = {
  ...env,
  JWT_SECRET,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};

async function adminCookie(id = "admin-1", email = "admin@test.com") {
  const token = await createAccessToken({ sub: id, role: "admin", email }, JWT_SECRET);
  return `access_token=${token}`;
}

describe("PAT routes are removed", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("GET /api/user/tokens returns 404", async () => {
    const cookie = await adminCookie();
    const res = await app.request("/api/user/tokens", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(404);
  });

  it("POST /api/user/tokens returns 404", async () => {
    const cookie = await adminCookie();
    const res = await app.request(
      "/api/user/tokens",
      { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" },
      TEST_ENV
    );
    expect(res.status).toBe(404);
  });

  it("DELETE /api/user/tokens/:id returns 404", async () => {
    const cookie = await adminCookie();
    const res = await app.request("/api/user/tokens/some-id", { method: "DELETE", headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/user/oauth-clients still works", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns 200 with empty clients array", async () => {
    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: unknown[] }>();
    expect(body.clients).toEqual([]);
  });
});

describe("GET /api/user/oauth-clients — scopes field", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns scopes=mcp.read when client has only read tokens", async () => {
    await seedOAuthClient(env.DB, { id: "oc-read", client_name: "Read Client" });
    await seedPat(env.DB, {
      id: "pat-read",
      user_id: "admin-1",
      name: "Read Token",
      issued_via: "oauth",
      client_id: "oc-read",
      scopes: "read",
      token_hash: "hashread1",
    });
    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: Record<string, unknown>[] }>();
    expect(body.clients[0].scopes).toBe("mcp.read");
  });

  it("returns scopes=mcp.read mcp.write when client has a write token", async () => {
    await seedOAuthClient(env.DB, { id: "oc-write", client_name: "Write Client" });
    await seedPat(env.DB, {
      id: "pat-write",
      user_id: "admin-1",
      name: "Write Token",
      issued_via: "oauth",
      client_id: "oc-write",
      scopes: "read,write",
      token_hash: "hashwrite1",
    });
    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ clients: Record<string, unknown>[] }>();
    expect(body.clients[0].scopes).toBe("mcp.read mcp.write");
  });
});

describe("GET /api/user/oauth-clients/log", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
  });

  it("returns 200 with empty entries when no log exists", async () => {
    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients/log", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: unknown[]; total: number }>();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("returns log entries with oauth_client_id and oauth_client_name", async () => {
    await seedOAuthClient(env.DB, { id: "oc-log", client_name: "Log Client" });
    await seedPat(env.DB, {
      id: "pat-log",
      user_id: "admin-1",
      name: "Log Token",
      issued_via: "oauth",
      client_id: "oc-log",
      scopes: "read",
      token_hash: "hashlog1",
    });
    await env.DB.prepare(
      "INSERT INTO external_api_access_log (id, token_id, patient_id, tool, kind, status_code, error_code, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("log-1", "pat-log", null, "list_patients", "read", 200, null, null, null).run();

    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients/log", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: Record<string, unknown>[]; total: number }>();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].oauth_client_id).toBe("oc-log");
    expect(body.entries[0].oauth_client_name).toBe("Log Client");
    expect(body.entries[0].tool).toBe("list_patients");
  });

  it("filters by clientId query param", async () => {
    await seedOAuthClient(env.DB, { id: "oc-a", client_name: "Client A" });
    await seedOAuthClient(env.DB, { id: "oc-b", client_name: "Client B" });
    await seedPat(env.DB, { id: "pat-a", user_id: "admin-1", name: "Token A", issued_via: "oauth", client_id: "oc-a", scopes: "read", token_hash: "hasha1" });
    await seedPat(env.DB, { id: "pat-b", user_id: "admin-1", name: "Token B", issued_via: "oauth", client_id: "oc-b", scopes: "read", token_hash: "hashb1" });
    await env.DB.prepare(
      "INSERT INTO external_api_access_log (id, token_id, patient_id, tool, kind, status_code, error_code, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("log-a", "pat-a", null, "tool_a", "read", 200, null, null, null).run();
    await env.DB.prepare(
      "INSERT INTO external_api_access_log (id, token_id, patient_id, tool, kind, status_code, error_code, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("log-b", "pat-b", null, "tool_b", "read", 200, null, null, null).run();

    const cookie = await adminCookie();
    const res = await app.request("/api/user/oauth-clients/log?clientId=oc-a", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: Record<string, unknown>[] }>();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].oauth_client_name).toBe("Client A");
  });

  it("does not expose another user's log entries", async () => {
    await seedAdmin(env.DB, { id: "admin-2", email: "admin2@test.com" });
    await seedOAuthClient(env.DB, { id: "oc-admin2", client_name: "Admin2 Client" });
    await seedPat(env.DB, {
      id: "pat-admin2",
      user_id: "admin-2",
      name: "Admin2 Token",
      issued_via: "oauth",
      client_id: "oc-admin2",
      scopes: "read",
      token_hash: "hashadmin2",
    });
    await env.DB.prepare(
      "INSERT INTO external_api_access_log (id, token_id, patient_id, tool, kind, status_code, error_code, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind("log-admin2", "pat-admin2", null, "list_patients", "read", 200, null, null, null).run();

    const cookie = await adminCookie("admin-1", "admin@test.com");
    const res = await app.request("/api/user/oauth-clients/log", { headers: { Cookie: cookie } }, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: unknown[]; total: number }>();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });
});
