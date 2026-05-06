import { describe, it, expect, vi, beforeEach } from "vitest";
import { prepareUploadFile } from "./prepare-upload";

vi.mock("./heic", () => ({
  isHeic: vi.fn(),
  convertHeicToJpeg: vi.fn(),
}));

import { isHeic, convertHeicToJpeg } from "./heic";

const mockedIsHeic = vi.mocked(isHeic);
const mockedConvertHeicToJpeg = vi.mocked(convertHeicToJpeg);

beforeEach(() => {
  mockedIsHeic.mockReset();
  mockedConvertHeicToJpeg.mockReset();
});

describe("prepareUploadFile", () => {
  it("returns the same File unchanged when isHeic is false", async () => {
    const file = new File(["data"], "photo.jpg", { type: "image/jpeg" });
    mockedIsHeic.mockReturnValue(false);

    const result = await prepareUploadFile(file);

    expect(result).toBe(file);
    expect(mockedConvertHeicToJpeg).not.toHaveBeenCalled();
  });

  it("returns the converted File when isHeic is true", async () => {
    const original = new File(["heic-data"], "photo.heic", { type: "image/heic" });
    const converted = new File(["jpeg-data"], "photo.jpg", { type: "image/jpeg" });
    mockedIsHeic.mockReturnValue(true);
    mockedConvertHeicToJpeg.mockResolvedValue(converted);

    const result = await prepareUploadFile(original);

    expect(result).toBe(converted);
  });

  it("calls onConvertingChange(true) then onConvertingChange(false) on success", async () => {
    const file = new File(["heic-data"], "photo.heic", { type: "image/heic" });
    const converted = new File(["jpeg-data"], "photo.jpg", { type: "image/jpeg" });
    mockedIsHeic.mockReturnValue(true);
    mockedConvertHeicToJpeg.mockResolvedValue(converted);

    const calls: boolean[] = [];
    const onConvertingChange = vi.fn((v: boolean) => calls.push(v));

    await prepareUploadFile(file, { onConvertingChange });

    expect(calls).toEqual([true, false]);
  });

  it("calls onConvertingChange(false) even when convertHeicToJpeg rejects", async () => {
    const file = new File(["heic-data"], "photo.heic", { type: "image/heic" });
    mockedIsHeic.mockReturnValue(true);
    mockedConvertHeicToJpeg.mockRejectedValue(new Error("conversion failed"));

    const onConvertingChange = vi.fn();

    await expect(prepareUploadFile(file, { onConvertingChange })).rejects.toThrow(
      "conversion failed"
    );

    expect(onConvertingChange).toHaveBeenNthCalledWith(1, true);
    expect(onConvertingChange).toHaveBeenNthCalledWith(2, false);
  });

  it("does not throw when onConvertingChange is not provided", async () => {
    const file = new File(["heic-data"], "photo.heic", { type: "image/heic" });
    const converted = new File(["jpeg-data"], "photo.jpg", { type: "image/jpeg" });
    mockedIsHeic.mockReturnValue(true);
    mockedConvertHeicToJpeg.mockResolvedValue(converted);

    await expect(prepareUploadFile(file)).resolves.toBe(converted);
  });
});
