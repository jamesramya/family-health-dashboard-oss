import { describe, it, expect } from "vitest";
import { isSafeReturnTo, getSafeReturnTo } from "./safe-return-to";

describe("isSafeReturnTo", () => {
  it("accepts root path /", () => {
    expect(isSafeReturnTo("/")).toBe(true);
  });

  it("accepts path with query string", () => {
    expect(isSafeReturnTo("/oauth/authorize?foo=bar")).toBe(true);
  });

  it("accepts simple path", () => {
    expect(isSafeReturnTo("/settings")).toBe(true);
  });

  it("rejects protocol-relative URL //evil.com", () => {
    expect(isSafeReturnTo("//evil.com")).toBe(false);
  });

  it("rejects absolute HTTPS URL", () => {
    expect(isSafeReturnTo("https://evil.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isSafeReturnTo("")).toBe(false);
  });

  it("rejects javascript: URI", () => {
    expect(isSafeReturnTo("javascript:alert(1)")).toBe(false);
  });

  it("rejects relative path without leading slash", () => {
    expect(isSafeReturnTo("relative-no-slash")).toBe(false);
  });

  it("rejects backslash-prefixed path (open redirect via browser normalization)", () => {
    expect(isSafeReturnTo("/\\evil.com")).toBe(false);
  });

  it("rejects tab control character", () => {
    expect(isSafeReturnTo("/\tevil.com")).toBe(false);
  });

  it("rejects newline control character", () => {
    expect(isSafeReturnTo("/\nevil.com")).toBe(false);
  });

  it("rejects null byte", () => {
    expect(isSafeReturnTo("/\x00evil.com")).toBe(false);
  });
});

describe("getSafeReturnTo", () => {
  it("returns the path when returnTo is a safe path", () => {
    const params = new URLSearchParams("returnTo=%2Fsettings");
    expect(getSafeReturnTo(params)).toBe("/settings");
  });

  it("returns null when returnTo is missing", () => {
    const params = new URLSearchParams("");
    expect(getSafeReturnTo(params)).toBeNull();
  });

  it("returns null when returnTo is unsafe (absolute URL)", () => {
    const params = new URLSearchParams("returnTo=https%3A%2F%2Fevil.com");
    expect(getSafeReturnTo(params)).toBeNull();
  });

  it("returns null when returnTo is protocol-relative", () => {
    const params = new URLSearchParams("returnTo=%2F%2Fevil.com");
    expect(getSafeReturnTo(params)).toBeNull();
  });
});
