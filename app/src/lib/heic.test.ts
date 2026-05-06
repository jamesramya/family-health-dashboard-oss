import { describe, it, expect, vi, beforeEach } from "vitest";
import { isHeic, convertHeicToJpeg, HeicConversionError } from "./heic";

vi.mock("heic2any", () => ({
  default: vi.fn(),
}));

import heic2any from "heic2any";

describe("isHeic", () => {
  it("returns true for file.type image/heic", () => {
    const file = new File(["data"], "photo.heic", { type: "image/heic" });
    expect(isHeic(file)).toBe(true);
  });

  it("returns true for file.type image/heif", () => {
    const file = new File(["data"], "photo.heif", { type: "image/heif" });
    expect(isHeic(file)).toBe(true);
  });

  it("returns true for file.type image/heic-sequence", () => {
    const file = new File(["data"], "live.heic", { type: "image/heic-sequence" });
    expect(isHeic(file)).toBe(true);
  });

  it("returns true for file.type image/heif-sequence", () => {
    const file = new File(["data"], "live.heif", { type: "image/heif-sequence" });
    expect(isHeic(file)).toBe(true);
  });

  it("returns true for .HEIC filename with empty type", () => {
    const file = new File(["data"], "photo.HEIC", { type: "" });
    expect(isHeic(file)).toBe(true);
  });

  it("returns true for .heif filename with application/octet-stream type", () => {
    const file = new File(["data"], "IMG.heif", {
      type: "application/octet-stream",
    });
    expect(isHeic(file)).toBe(true);
  });

  it("returns false for image/jpeg", () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    expect(isHeic(file)).toBe(false);
  });

  it("returns false for application/pdf", () => {
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    expect(isHeic(file)).toBe(false);
  });

  it("returns false for image/png", () => {
    const file = new File(["data"], "image.png", { type: "image/png" });
    expect(isHeic(file)).toBe(false);
  });
});

describe("convertHeicToJpeg", () => {
  const mockedHeic2any = vi.mocked(heic2any);

  beforeEach(() => {
    mockedHeic2any.mockReset();
  });

  it("returns a jpeg File with .jpg name from a .HEIC input", async () => {
    const jpegBlob = new Blob(["jpeg-data"], { type: "image/jpeg" });
    mockedHeic2any.mockResolvedValue(jpegBlob);

    const input = new File(["heic-data"], "photo.HEIC", { type: "image/heic" });
    const result = await convertHeicToJpeg(input);

    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("photo.jpg");
  });

  it("uses the first element when heic2any returns a Blob array", async () => {
    const firstBlob = new Blob(["first"], { type: "image/jpeg" });
    const secondBlob = new Blob(["second"], { type: "image/jpeg" });
    mockedHeic2any.mockResolvedValue([firstBlob, secondBlob]);

    const input = new File(["heic-data"], "burst.heic", { type: "image/heic" });
    const result = await convertHeicToJpeg(input);

    expect(result).toBeInstanceOf(File);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("burst.jpg");
    expect(result.size).toBe(firstBlob.size);
  });

  it("strips .heif suffix case-insensitively when building output name", async () => {
    const jpegBlob = new Blob(["jpeg-data"], { type: "image/jpeg" });
    mockedHeic2any.mockResolvedValue(jpegBlob);

    const input = new File(["heic-data"], "IMG.HEIF", { type: "image/heif" });
    const result = await convertHeicToJpeg(input);

    expect(result.name).toBe("IMG.jpg");
  });

  it("throws HeicConversionError when heic2any rejects", async () => {
    mockedHeic2any.mockRejectedValue(new Error("bad format"));

    const input = new File(["data"], "broken.heic", { type: "image/heic" });
    await expect(convertHeicToJpeg(input)).rejects.toBeInstanceOf(
      HeicConversionError
    );
  });

  it("HeicConversionError message contains the underlying error message", async () => {
    mockedHeic2any.mockRejectedValue(new Error("bad format"));

    const input = new File(["data"], "broken.heic", { type: "image/heic" });
    await expect(convertHeicToJpeg(input)).rejects.toThrow("bad format");
  });
});
