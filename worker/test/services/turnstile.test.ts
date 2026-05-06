import { describe, it, expect, vi } from "vitest";
import { verifyTurnstileToken } from "../../src/services/turnstile";

describe("Turnstile verification", () => {
  it("returns true for valid token", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }))
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await verifyTurnstileToken("valid-token", "secret-key", "1.2.3.4");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      expect.objectContaining({ method: "POST" })
    );

    vi.unstubAllGlobals();
  });

  it("returns false for invalid token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }))
    ));

    const result = await verifyTurnstileToken("bad-token", "secret-key", "1.2.3.4");
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });

  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));

    const result = await verifyTurnstileToken("token", "secret-key", "1.2.3.4");
    expect(result).toBe(false);

    vi.unstubAllGlobals();
  });
});
