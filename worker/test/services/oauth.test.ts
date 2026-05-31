import { describe, it, expect } from "vitest";
import { verifyPkceS256, mapOAuthScopeToPat, isRedirectUriRegistered, mintTokenBytes } from "../../src/services/oauth";

describe("verifyPkceS256", () => {
  it("accepts correct verifier", async () => {
    // RFC 7636 Appendix B
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects wrong verifier", async () => {
    const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    expect(await verifyPkceS256("wrong-verifier", challenge)).toBe(false);
  });
});

describe("mapOAuthScopeToPat", () => {
  it("maps mcp.read → read", () => {
    expect(mapOAuthScopeToPat("mcp.read")).toBe("read");
  });

  it("maps mcp.read mcp.write → read,write", () => {
    expect(mapOAuthScopeToPat("mcp.read mcp.write")).toBe("read,write");
  });

  it("maps mcp.write mcp.read (reversed order) → read,write", () => {
    expect(mapOAuthScopeToPat("mcp.write mcp.read")).toBe("read,write");
  });

  it("throws for unknown scope", () => {
    expect(() => mapOAuthScopeToPat("openid")).toThrow("invalid_scope");
  });
});

describe("isRedirectUriRegistered", () => {
  const registered = JSON.stringify(["https://example.com/cb", "myapp://callback"]);

  it("accepts registered URI", () => {
    expect(isRedirectUriRegistered(registered, "https://example.com/cb")).toBe(true);
  });

  it("rejects unregistered URI", () => {
    expect(isRedirectUriRegistered(registered, "https://evil.com/cb")).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isRedirectUriRegistered(registered, "HTTPS://EXAMPLE.COM/cb")).toBe(false);
  });

  it("rejects URI with trailing slash if not registered with one", () => {
    expect(isRedirectUriRegistered(registered, "https://example.com/cb/")).toBe(false);
  });

  it("returns false for malformed registered string", () => {
    expect(isRedirectUriRegistered("not-json", "https://example.com/cb")).toBe(false);
  });
});

describe("mintTokenBytes", () => {
  it("returns 64-char lowercase hex", () => {
    const token = mintTokenBytes();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns unique values", () => {
    const a = mintTokenBytes();
    const b = mintTokenBytes();
    expect(a).not.toBe(b);
  });
});
