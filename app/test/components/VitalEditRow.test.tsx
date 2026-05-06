import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { VitalReading } from "@/types/api";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const confirmMock = vi.fn<(opts: unknown) => Promise<boolean>>();
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => confirmMock }));

import { api } from "@/lib/api";
import { VitalEditRow } from "@/components/VitalEditRow";

const mockApi = api as {
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const bpReading: VitalReading = {
  id: "v1",
  patient_id: "p1",
  type: "bp",
  measured_at: "2026-04-20T10:30:00.000Z",
  value_primary: 144,
  value_secondary: 81,
  value_tertiary: null,
  unit: "mmHg",
  context: "morning",
  notes: null,
  source: "manual",
};

const hrReading: VitalReading = {
  id: "v2",
  patient_id: "p1",
  type: "heart_rate",
  measured_at: "2026-04-20T10:30:00.000Z",
  value_primary: 84,
  value_secondary: null,
  value_tertiary: null,
  unit: "bpm",
  context: null,
  notes: null,
  source: "manual",
};

function renderRow(reading: VitalReading, onDone = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <VitalEditRow reading={reading} patientId="p1" onDone={onDone} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockReset();
});

describe("VitalEditRow", () => {
  it("pre-fills value_primary from the reading", () => {
    renderRow(bpReading);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(144);
  });

  it("shows value_secondary input for BP and pre-fills it", () => {
    renderRow(bpReading);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    expect(inputs[1]).toHaveValue(81);
  });

  it("does not show value_secondary input for non-BP types", () => {
    renderRow(hrReading);
    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(1);
  });

  it("pre-fills context when present", () => {
    renderRow(bpReading);
    expect(screen.getByPlaceholderText(/fasting/i)).toHaveValue("morning");
  });

  it("calls onDone without saving when Cancel is clicked", async () => {
    const onDone = vi.fn();
    renderRow(bpReading, onDone);
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDone).toHaveBeenCalled();
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it("calls PUT with updated value_primary and invokes onDone on success", async () => {
    mockApi.put.mockResolvedValue({ vital: { id: "v1" } });
    const onDone = vi.fn();
    renderRow(bpReading, onDone);

    const inputs = screen.getAllByRole("spinbutton");
    await userEvent.clear(inputs[0]);
    await userEvent.type(inputs[0], "130");

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockApi.put).toHaveBeenCalledWith(
      "/patients/p1/vitals/v1",
      expect.objectContaining({ value_primary: 130 })
    );
  });

  it("shows an error message when save fails", async () => {
    mockApi.put.mockRejectedValue(new Error("Server error"));
    renderRow(bpReading);

    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
  });

  describe("delete", () => {
    it("renders a Delete button in edit mode", () => {
      renderRow(bpReading);
      expect(screen.getByRole("button", { name: /delete reading/i })).toBeInTheDocument();
    });

    it("does NOT call DELETE when confirm is cancelled", async () => {
      confirmMock.mockResolvedValue(false);
      const onDone = vi.fn();
      renderRow(bpReading, onDone);

      await userEvent.click(screen.getByRole("button", { name: /delete reading/i }));

      await waitFor(() => expect(confirmMock).toHaveBeenCalled());
      expect(mockApi.delete).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
    });

    it("calls DELETE on confirm and invokes onDone on success", async () => {
      confirmMock.mockResolvedValue(true);
      mockApi.delete.mockResolvedValue(undefined);
      const onDone = vi.fn();
      renderRow(bpReading, onDone);

      await userEvent.click(screen.getByRole("button", { name: /delete reading/i }));

      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(mockApi.delete).toHaveBeenCalledWith("/patients/p1/vitals/v1");
    });

    it("shows an error message when delete fails", async () => {
      confirmMock.mockResolvedValue(true);
      mockApi.delete.mockRejectedValue(new Error("Server error"));
      const onDone = vi.fn();
      renderRow(bpReading, onDone);

      await userEvent.click(screen.getByRole("button", { name: /delete reading/i }));

      await waitFor(() => expect(screen.getByText("Server error")).toBeInTheDocument());
      expect(onDone).not.toHaveBeenCalled();
    });
  });
});
