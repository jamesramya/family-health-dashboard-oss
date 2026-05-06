import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildUploadFormData } from "./upload-helpers";

vi.mock("./prepare-upload", () => ({
  prepareUploadFile: vi.fn(async (file: File) => file),
}));

import { prepareUploadFile } from "./prepare-upload";
const mockedPrepare = vi.mocked(prepareUploadFile);

beforeEach(() => {
  mockedPrepare.mockImplementation(async (file) => file);
});

describe("buildUploadFormData", () => {
  it("appends file with its name stripped of extension as title", async () => {
    const file = new File(["x"], "report.jpg", { type: "image/jpeg" });
    const fd = await buildUploadFormData(file);
    expect((fd.get("file") as File).name).toBe("report.jpg");
    expect(fd.get("title")).toBe("report");
  });

  it("defaults type to 'other' when not provided", async () => {
    const file = new File(["x"], "scan.pdf", { type: "application/pdf" });
    const fd = await buildUploadFormData(file);
    expect(fd.get("type")).toBe("other");
  });

  it("uses provided type option", async () => {
    const file = new File(["x"], "scan.pdf", { type: "application/pdf" });
    const fd = await buildUploadFormData(file, { type: "scan" });
    expect(fd.get("type")).toBe("scan");
  });

  it("sets document_date to today in YYYY-MM-DD format", async () => {
    const file = new File(["x"], "report.pdf", { type: "application/pdf" });
    const fd = await buildUploadFormData(file);
    expect(fd.get("document_date")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("omits source_lab when not provided", async () => {
    const file = new File(["x"], "report.pdf");
    const fd = await buildUploadFormData(file);
    expect(fd.get("source_lab")).toBeNull();
  });

  it("appends source_lab when provided", async () => {
    const file = new File(["x"], "report.pdf");
    const fd = await buildUploadFormData(file, { sourceLab: "Apollo Hospitals" });
    expect(fd.get("source_lab")).toBe("Apollo Hospitals");
  });

  it("uses the file returned by prepareUploadFile, not the original", async () => {
    const original = new File(["h"], "photo.heic", { type: "image/heic" });
    const converted = new File(["j"], "photo.jpg", { type: "image/jpeg" });
    mockedPrepare.mockResolvedValue(converted);
    const fd = await buildUploadFormData(original);
    expect(fd.get("file")).toBe(converted);
    expect(fd.get("title")).toBe("photo");
  });

  it("propagates rejection from prepareUploadFile", async () => {
    const file = new File(["h"], "photo.heic", { type: "image/heic" });
    mockedPrepare.mockRejectedValue(new Error("conversion failed"));
    await expect(buildUploadFormData(file)).rejects.toThrow("conversion failed");
  });
});
