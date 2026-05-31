import { describe, it, expect } from "vitest";
import * as useTokensModule from "./use-tokens";
import {
  useOAuthClients,
  useRevokeOAuthClient,
  useAccessLog,
  type OAuthClientItem,
  type OAuthAccessLogEntry,
} from "./use-tokens";

describe("use-tokens exports", () => {
  it("does NOT export useTokens (PAT hook removed)", () => {
    expect((useTokensModule as Record<string, unknown>).useTokens).toBeUndefined();
  });

  it("does NOT export useCreateToken (PAT hook removed)", () => {
    expect((useTokensModule as Record<string, unknown>).useCreateToken).toBeUndefined();
  });

  it("does NOT export useRevokeToken (PAT hook removed)", () => {
    expect((useTokensModule as Record<string, unknown>).useRevokeToken).toBeUndefined();
  });

  it("exports useOAuthClients", () => {
    expect(typeof useOAuthClients).toBe("function");
  });

  it("exports useRevokeOAuthClient", () => {
    expect(typeof useRevokeOAuthClient).toBe("function");
  });

  it("exports useAccessLog", () => {
    expect(typeof useAccessLog).toBe("function");
  });
});

describe("OAuthClientItem type includes scopes", () => {
  it("OAuthClientItem has scopes field", () => {
    const item: OAuthClientItem = {
      id: "c1",
      client_name: "Claude Desktop",
      scopes: "mcp.read mcp.write",
      created_at: "2026-01-01T00:00:00.000Z",
      last_used_at: null,
    };
    expect(item.scopes).toBe("mcp.read mcp.write");
  });
});

describe("OAuthAccessLogEntry type", () => {
  it("has oauth_client_id and oauth_client_name fields", () => {
    const entry: OAuthAccessLogEntry = {
      id: "e1",
      oauth_client_id: "c1",
      oauth_client_name: "Claude Desktop",
      patient_id: null,
      patient_name: null,
      tool: "list_patients",
      kind: "read",
      status_code: 200,
      error_code: null,
      ip: null,
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(entry.oauth_client_id).toBe("c1");
  });
});

describe("useAccessLog query key", () => {
  it("query key includes clientId, patientId, page", () => {
    const key = ["oauth-access-log", { clientId: "c1", patientId: "p1", page: 2 }];
    expect(key[0]).toBe("oauth-access-log");
    expect((key[1] as Record<string, unknown>).page).toBe(2);
  });
});
