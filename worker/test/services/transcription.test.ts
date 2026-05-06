import { describe, it, expect, vi, afterEach } from "vitest";
import { transcribeAudio } from "../../src/services/transcription";

afterEach(() => vi.restoreAllMocks());

function deepgramOk(transcript: string) {
  return new Response(
    JSON.stringify({
      metadata: {},
      results: {
        channels: [
          { alternatives: [{ transcript, confidence: 0.99, words: [] }] }
        ]
      }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("transcribeAudio", () => {
  it("returns transcript string on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(deepgramOk("Patient reports chest pain."));
    const result = await transcribeAudio("test-key", new ArrayBuffer(100));
    expect(result).toBe("Patient reports chest pain.");
  });

  it("returns empty string when transcript is empty", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(deepgramOk(""));
    const result = await transcribeAudio("test-key", new ArrayBuffer(10));
    expect(result).toBe("");
  });

  it("throws on 401 from Deepgram", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ err_code: "INVALID_AUTH" }), { status: 401 })
    );
    await expect(transcribeAudio("bad-key", new ArrayBuffer(10))).rejects.toThrow();
  });

  it("throws on network error", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network failure"));
    await expect(transcribeAudio("test-key", new ArrayBuffer(10))).rejects.toThrow("Network failure");
  });
});
