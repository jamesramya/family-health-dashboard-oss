import { describe, it, expect } from "vitest";
import { fileTypeLabel } from "./file-type";

describe("fileTypeLabel", () => {
  it("returns PDF for application/pdf mime_type", () => {
    expect(fileTypeLabel({ mime_type: "application/pdf" })).toBe("PDF");
  });

  it("returns JPG for image/jpeg mime_type", () => {
    expect(fileTypeLabel({ mime_type: "image/jpeg" })).toBe("JPG");
  });

  it("returns HEIC for image/heic mime_type", () => {
    expect(fileTypeLabel({ mime_type: "image/heic" })).toBe("HEIC");
  });

  it("returns HEIC for image/heif mime_type", () => {
    expect(fileTypeLabel({ mime_type: "image/heif" })).toBe("HEIC");
  });

  it("returns extension label when mime_type is empty and r2_key has extension", () => {
    expect(fileTypeLabel({ mime_type: null, r2_key: "documents/abc/foo.png" })).toBe("PNG");
  });

  it("returns FILE when mime_type is unknown and r2_key has no extension", () => {
    expect(fileTypeLabel({ mime_type: "application/octet-stream", r2_key: "documents/abc/noext" })).toBe("FILE");
  });

  it("parses extension case-insensitively from r2_key", () => {
    expect(fileTypeLabel({ mime_type: null, r2_key: "documents/abc/foo.PDF" })).toBe("PDF");
  });

  it("returns PNG for image/png mime_type", () => {
    expect(fileTypeLabel({ mime_type: "image/png" })).toBe("PNG");
  });

  it("returns WEBP for image/webp mime_type", () => {
    expect(fileTypeLabel({ mime_type: "image/webp" })).toBe("WEBP");
  });
});
