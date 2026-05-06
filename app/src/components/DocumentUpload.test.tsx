import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DocumentUpload } from "./DocumentUpload";

const mockEnqueue = vi.hoisted(() => vi.fn());
const mockBuildUploadFormData = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/upload-queue", () => ({
  useUploadQueue: () => ({ enqueue: mockEnqueue }),
}));
vi.mock("@/lib/upload-helpers", () => ({
  buildUploadFormData: mockBuildUploadFormData,
}));

describe("DocumentUpload", () => {
  beforeEach(() => {
    mockEnqueue.mockClear();
    mockBuildUploadFormData.mockImplementation((file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.[^.]+$/, ""));
      fd.append("type", "other");
      fd.append("document_date", new Date().toISOString().slice(0, 10));
      return Promise.resolve(fd);
    });
  });

  it("enqueues file on submit", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DocumentUpload patientId="p1" />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["x"], "report.pdf", { type: "application/pdf" }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledWith("p1", expect.any(FormData), expect.any(String)));
  });

  it("shows Converting HEIC… on submit button while converting", async () => {
    let triggerConverting!: () => void;
    mockBuildUploadFormData.mockImplementation(
      (_file: File, opts?: { onConvertingChange?: (v: boolean) => void }) => {
        return new Promise<FormData>((_resolve) => {
          triggerConverting = () => {
            opts?.onConvertingChange?.(true);
            // never resolve — simulates an in-progress conversion
          };
          triggerConverting();
          // keep promise pending — never call resolve
        });
      }
    );

    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["h"], "photo.heic", { type: "image/heic" }));
    await user.click(screen.getByRole("button", { name: /upload/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /converting heic/i })).toBeDisabled()
    );
  });

  it("shows alert and does not enqueue when buildUploadFormData rejects", async () => {
    mockBuildUploadFormData.mockRejectedValue(new Error("conversion failed"));

    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, new File(["h"], "photo.heic", { type: "image/heic" }));
    await user.click(screen.getByRole("button", { name: /upload/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("clears convert error when new file is selected", async () => {
    mockBuildUploadFormData.mockRejectedValueOnce(new Error("conversion failed"));

    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    // Trigger an error first
    await user.upload(input, new File(["h"], "photo.heic", { type: "image/heic" }));
    await user.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    // Pick a replacement file — error should clear
    await user.upload(input, new File(["x"], "report.pdf", { type: "application/pdf" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows both filenames in the drop zone after selecting two files", async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "alpha.pdf", { type: "application/pdf" }),
      new File(["b"], "beta.jpg", { type: "image/jpeg" }),
    ]);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.jpg")).toBeInTheDocument();
  });

  it("removes a file when its × button is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "alpha.pdf", { type: "application/pdf" }),
      new File(["b"], "beta.jpg", { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: "Remove alpha.pdf" }));
    expect(screen.queryByText("alpha.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("beta.jpg")).toBeInTheDocument();
  });

  it("shows 'Upload 2 files' when two files are selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "alpha.pdf", { type: "application/pdf" }),
      new File(["b"], "beta.jpg", { type: "image/jpeg" }),
    ]);
    expect(screen.getByRole("button", { name: /upload 2 files/i })).toBeInTheDocument();
  });

  it("enqueues each file when two files are submitted", async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["a"], "alpha.pdf", { type: "application/pdf" }),
      new File(["b"], "beta.jpg", { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: /upload 2 files/i }));
    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledTimes(2));
  });

  it("does not add a duplicate filename to the list", async () => {
    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    // Select two different files
    await user.upload(input, [
      new File(["a"], "alpha.pdf", { type: "application/pdf" }),
      new File(["b"], "beta.jpg", { type: "image/jpeg" }),
    ]);
    // Try to add alpha.pdf again — should be deduped
    await user.upload(input, [new File(["c"], "alpha.pdf", { type: "application/pdf" })]);
    // Should still be exactly 2 items, not 3
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(2);
    expect(screen.queryAllByText("alpha.pdf")).toHaveLength(1);
  });

  it("enqueues successful files and shows error when one file fails conversion", async () => {
    mockBuildUploadFormData
      .mockRejectedValueOnce(new Error("conversion failed"))  // alpha.heic fails
      .mockImplementationOnce((file: File) => {               // beta.jpg succeeds
        const fd = new FormData();
        fd.append("file", file);
        return Promise.resolve(fd);
      });

    const user = userEvent.setup();
    const { container } = render(<DocumentUpload patientId="p1" />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, [
      new File(["h"], "alpha.heic", { type: "image/heic" }),
      new File(["b"], "beta.jpg",  { type: "image/jpeg" }),
    ]);
    await user.click(screen.getByRole("button", { name: /upload 2 files/i }));

    await waitFor(() => expect(mockEnqueue).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
