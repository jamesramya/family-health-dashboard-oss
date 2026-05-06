import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationEditRow } from "./MedicationEditRow";
import type { Medication, MedicationSchedule } from "@/types/api";

const mockConfirm = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
const mockDelete = vi.fn().mockResolvedValue({});
const mockDiscontinue = vi.fn().mockResolvedValue({});
const mockRestart = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => mockConfirm,
}));

vi.mock("@/hooks/use-medications", () => ({
  useUpdateMedication: () => ({ mutateAsync: mockUpdate, isPending: false }),
  useDeleteMedication: () => ({ mutateAsync: mockDelete, isPending: false }),
  useDiscontinueMedication: () => ({ mutateAsync: mockDiscontinue, isPending: false }),
  useRestartMedication: () => ({ mutateAsync: mockRestart, isPending: false }),
}));

const baseMed: Medication & { schedules: MedicationSchedule[] } = {
  id: "m1",
  patient_id: "p1",
  brand_name: "Eltroxin",
  generic_name: "levothyroxine",
  dosage: "75 mcg",
  form: "tablet",
  start_date: "2025-01-01",
  end_date: null,
  reason: "Hypothyroidism",
  is_active: 1,
  notes: null,
  lifecycle_events: [],
  prescription_ids: [],
  schedules: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MedicationEditRow", () => {
  it("renders the medication brand name as a label", () => {
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={vi.fn()} />);
    expect(screen.getByText(/Eltroxin/i)).toBeInTheDocument();
  });

  it("renders Save and Cancel buttons", () => {
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("renders a Delete button in rose colour", () => {
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={vi.fn()} />);
    const del = screen.getByRole("button", { name: /delete/i });
    expect(del).toBeInTheDocument();
    expect(del.className).toContain("rose");
  });

  it("Delete asks for confirmation before mutating", async () => {
    mockConfirm.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("Delete confirmed calls deleteVital.mutateAsync then onDone", async () => {
    mockConfirm.mockResolvedValueOnce(true);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("m1"));
    expect(onDone).toHaveBeenCalled();
  });

  it("Cancel calls onDone immediately", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onDone).toHaveBeenCalled();
  });

  it("Save calls updateMedication.mutateAsync then onDone", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalled();
  });

  it("shows Discontinue button for active medication", () => {
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: /discontinue/i })).toBeInTheDocument();
  });

  it("shows Restart button for inactive medication", () => {
    const inactive = { ...baseMed, is_active: 0 };
    render(<MedicationEditRow medication={inactive} patientId="p1" onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: /restart/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discontinue/i })).not.toBeInTheDocument();
  });

  it("Discontinue confirmed calls discontinueMedication then onDone", async () => {
    mockConfirm.mockResolvedValueOnce(true);
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<MedicationEditRow medication={baseMed} patientId="p1" onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: /discontinue/i }));
    await waitFor(() => expect(mockDiscontinue).toHaveBeenCalledWith({ id: "m1" }));
    expect(onDone).toHaveBeenCalled();
  });
});
