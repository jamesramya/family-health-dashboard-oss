import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, sha256hex } from "../../src/services/crypto";

describe("PBKDF2 password hashing", () => {
  it("hashes and verifies correctly", async () => {
    const hash = await hashPassword("securePass12345");
    expect(hash).not.toBe("securePass12345");
    expect(await verifyPassword("securePass12345", hash)).toBe(true);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("securePass12345");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("uses unique salts", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });

  it("stores iterations:salt:hash format", async () => {
    const hash = await hashPassword("test1234567890");
    const parts = hash.split(":");
    expect(parts).toHaveLength(3);
    expect(parseInt(parts[0])).toBeGreaterThanOrEqual(100_000);
    expect(parts[1]).toHaveLength(32); // 16 bytes hex
    expect(parts[2]).toHaveLength(64); // 32 bytes hex
  });
});

describe("sha256hex", () => {
  it("produces consistent 64-char hex", async () => {
    const h1 = await sha256hex("hello");
    const h2 = await sha256hex("hello");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("different inputs produce different hashes", async () => {
    expect(await sha256hex("a")).not.toBe(await sha256hex("b"));
  });
});
