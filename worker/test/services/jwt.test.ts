import { describe, it, expect } from "vitest";
import { createAccessToken, verifyAccessToken, type TokenPayload } from "../../src/services/jwt";

const SECRET = "test-jwt-secret-key-must-be-at-least-32-chars";

describe("JWT", () => {
  it("creates and verifies a token", async () => {
    const payload: TokenPayload = { sub: "u1", role: "admin", email: "a@b.com" };
    const token = await createAccessToken(payload, SECRET);
    const decoded = await verifyAccessToken(token, SECRET);
    expect(decoded.sub).toBe("u1");
    expect(decoded.role).toBe("admin");
    expect(decoded.email).toBe("a@b.com");
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it("rejects expired token", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, SECRET, -1);
    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow("expired");
  });

  it("rejects tampered token", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, SECRET);
    await expect(verifyAccessToken(token.slice(0, -4) + "XXXX", SECRET)).rejects.toThrow();
  });

  it("rejects token signed with different secret", async () => {
    const token = await createAccessToken({ sub: "u1", role: "admin", email: "a@b.com" }, SECRET);
    await expect(verifyAccessToken(token, "other-secret-key-also-32-chars-long!!")).rejects.toThrow();
  });
});
