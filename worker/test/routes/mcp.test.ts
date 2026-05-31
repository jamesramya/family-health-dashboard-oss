import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { app } from "../../src/index";
import { setupDb, seedAdmin, seedPatient, seedPat } from "../helpers/setup-db";
import { sha256hex } from "../../src/services/crypto";

const JWT_SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

const RAW_TOKEN = "mcp_" + "a".repeat(64);

const TEST_ENV = {
  ...env,
  JWT_SECRET,
  RATE_LIMITER: { limit: async () => ({ success: true }) },
};

type JsonRpcResponse = {
  jsonrpc: string;
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
};

async function mcpPost(body: unknown, auth?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers["Authorization"] = auth;
  return app.request(
    "/mcp",
    { method: "POST", headers, body: JSON.stringify(body) },
    TEST_ENV
  );
}

describe("POST /mcp", () => {
  let tokenHash: string;

  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
    await seedPatient(env.DB);
    tokenHash = await sha256hex(RAW_TOKEN);
    await seedPat(env.DB, { token_hash: tokenHash, user_id: "admin-1", scopes: "read" });
  });

  it("without auth returns 401", async () => {
    const res = await app.request(
      "/mcp",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }) },
      TEST_ENV
    );
    expect(res.status).toBe(401);
    // Middleware returns plain JSON, not JSON-RPC error envelope
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("token_missing");
  });

  it("initialize returns correct serverInfo", async () => {
    const res = await mcpPost(
      { jsonrpc: "2.0", method: "initialize", params: {}, id: 1 },
      `Bearer ${RAW_TOKEN}`
    );
    expect(res.status).toBe(200);
    const body = await res.json<JsonRpcResponse>();
    const result = body.result as { serverInfo: { name: string; version: string } };
    expect(result.serverInfo.name).toBe("Family Health Dashboard");
    expect(result.serverInfo.version).toBe("1.0.0");
  });

  it("tools/list returns array with 12 tools", async () => {
    const res = await mcpPost(
      { jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 },
      `Bearer ${RAW_TOKEN}`
    );
    expect(res.status).toBe(200);
    const body = await res.json<JsonRpcResponse>();
    const result = body.result as { tools: unknown[] };
    expect(Array.isArray(result.tools)).toBe(true);
    expect(result.tools.length).toBe(12);
  });

  it("tools/call list_patients returns text content", async () => {
    const res = await mcpPost(
      {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "list_patients", arguments: {} },
        id: 3,
      },
      `Bearer ${RAW_TOKEN}`
    );
    expect(res.status).toBe(200);
    const body = await res.json<JsonRpcResponse>();
    const result = body.result as { content: { type: string }[] };
    expect(result.content[0].type).toBe("text");
  });

  it("bad JSON body returns JSON-RPC parse error -32700", async () => {
    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RAW_TOKEN}`,
        },
        body: "this is not json{{",
      },
      TEST_ENV
    );
    expect(res.status).toBe(400);
    const body = await res.json<JsonRpcResponse>();
    expect(body.error?.code).toBe(-32700);
  });

  it("unknown method returns -32601", async () => {
    const res = await mcpPost(
      { jsonrpc: "2.0", method: "unknown/method", id: 4 },
      `Bearer ${RAW_TOKEN}`
    );
    expect(res.status).toBe(200);
    const body = await res.json<JsonRpcResponse>();
    expect(body.error?.code).toBe(-32601);
  });
});

describe("GET /.well-known/mcp", () => {
  beforeEach(async () => {
    await setupDb(env.DB);
    await seedAdmin(env.DB);
  });

  it("no auth required — returns 200 with mcp_url field", async () => {
    const res = await app.request("/.well-known/mcp", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ mcp_url: string; name: string }>();
    expect(typeof body.mcp_url).toBe("string");
    expect(body.mcp_url).toContain("/mcp");
    expect(body.name).toBe("Family Health Dashboard");
  });

  it("auth block uses oauth2 type with correct endpoints", async () => {
    const res = await app.request("/.well-known/mcp", {}, TEST_ENV);
    expect(res.status).toBe(200);
    const body = await res.json<{ auth: { type: string; authorization_url: string } }>();
    expect(body.auth.type).toBe("oauth2");
    expect(body.auth.authorization_url).toContain("/oauth/authorize");
  });
});
