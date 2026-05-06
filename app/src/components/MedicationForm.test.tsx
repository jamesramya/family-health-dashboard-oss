import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MedicationForm } from "./MedicationForm";

const mockCreateMutateAsync = vi.fn().mockResolvedValue({});
const mockUpdateMutateAsync = vi.fn().mockResolvedValue({});

vi.mock("@/hooks/use-medications", () => ({
  useCreateMedication: () => ({ mutateAsync: mockCreateMutateAsync }),
  useUpdateMedication: () => ({ mutateAsync: mockUpdateMutateAsync }),
}));

const existing = {
  id: "m1",
  patient_id: "p1",
  brand_name: "Aspirin",
  generic_name: null,
  dosage: "100mg",
  form: "tablet",
  start_date: null,
  end_date: null,
  reason: null,
  notes: null,
  is_active: true,
  created_at: "",
  updated_at: "",
} as any;

beforeEach(() => {
  mockCreateMutateAsync.mockClear();
  mockUpdateMutateAsync.mockClear();
});

describe("MedicationForm", () => {
  it("create mode renders correctly", () => {
    render(<MedicationForm patientId="p1" />);
    expect(screen.getByText("Save 1 medication")).toBeInTheDocument();
    expect(screen.queryByText("Update Medication")).not.toBeInTheDocument();
  });

  it("edit mode renders correctly", () => {
    render(<MedicationForm patientId="p1" existing={existing} />);
    expect(screen.getByText("Update Medication")).toBeInTheDocument();
    expect(screen.queryByText("Save 1 medication")).not.toBeInTheDocument();
  });

  it("brand name required validation", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);

    await user.click(screen.getByText("Save 1 medication"));

    expect(screen.getByText("Brand name is required")).toBeInTheDocument();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it("adds a medication card", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);

    expect(screen.queryByText("✕ Remove")).not.toBeInTheDocument();

    await user.click(screen.getByText("＋ Add another medication"));

    expect(screen.getAllByText("✕ Remove")).toHaveLength(2);
  });

  it("removes a medication card", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);

    await user.click(screen.getByText("＋ Add another medication"));
    expect(screen.getAllByText("✕ Remove")).toHaveLength(2);

    await user.click(screen.getAllByText("✕ Remove")[0]);

    expect(screen.queryByText("✕ Remove")).not.toBeInTheDocument();
  });

  it("adds a schedule row", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);

    const removeScheduleBtns = () =>
      screen.getAllByRole("button", { name: "✕" });

    expect(removeScheduleBtns()).toHaveLength(1);

    await user.click(screen.getByText("＋ Add row"));

    expect(removeScheduleBtns()).toHaveLength(2);
  });

  it("multi-card create calls mutateAsync per card", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);

    const brandInputs = () =>
      screen.getAllByPlaceholderText("e.g. Metformin");
    await user.type(brandInputs()[0], "Aspirin");

    await user.click(screen.getByText("＋ Add another medication"));

    await user.type(brandInputs()[1], "Metformin");

    await user.click(screen.getByText("Save 2 medications"));

    expect(mockCreateMutateAsync).toHaveBeenCalledTimes(2);
  });

  it("edit mode calls updateMutateAsync", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" existing={existing} />);

    await user.click(screen.getByText("Update Medication"));

    expect(mockUpdateMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });

  it("toggling a day button changes its active state", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    const mondayBtn = screen.getByRole("button", { name: "M" });
    expect(mondayBtn).toHaveClass("bg-teal-500");
    await user.click(mondayBtn);
    expect(mondayBtn).not.toHaveClass("bg-teal-500");
    expect(mondayBtn).toHaveClass("border-cream-300");
  });

  it("retains failed card with error message", async () => {
    mockCreateMutateAsync.mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    await user.type(screen.getByPlaceholderText("e.g. Metformin"), "Aspirin");
    await user.click(screen.getByRole("button", { name: /save 1 medication/i }));
    expect(await screen.findByText(/Server error|Failed to save/i)).toBeInTheDocument();
  });

  it("removes a schedule row", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    expect(screen.getAllByRole("button", { name: "✕" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "＋ Add row" }));
    expect(screen.getAllByRole("button", { name: "✕" })).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "✕" })[0]);
    expect(screen.getAllByRole("button", { name: "✕" })).toHaveLength(1);
  });

  it("'+ Other days' button is visible on a schedule row", () => {
    render(<MedicationForm patientId="p1" />);
    expect(screen.getByRole("button", { name: /other days/i })).toBeInTheDocument();
  });

  it("'+ Other days' on an all-days row splits into Mon–Fri + Sat–Sun rows", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    // initial: 1 schedule row with all days selected
    expect(screen.getAllByRole("button", { name: "✕" })).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /other days/i }));
    // after split: 2 rows
    expect(screen.getAllByRole("button", { name: "✕" })).toHaveLength(2);
  });

  it("save sends days_of_week='all' when all 7 day pills are selected", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    await user.type(screen.getByPlaceholderText("e.g. Metformin"), "Eltroxin");
    await user.click(screen.getByText("Save 1 medication"));
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        schedules: expect.arrayContaining([
          expect.objectContaining({ days_of_week: "all" }),
        ]),
      })
    );
  });

  it("save sends bare day key when only one day pill is selected", async () => {
    const user = userEvent.setup();
    render(<MedicationForm patientId="p1" />);
    // deselect all except Monday (click all 6 others: T W T F S S)
    const dayBtns = screen.getAllByRole("button", { name: /^[MTWFS]$/ });
    // indices 1-6 are T W T F S S
    for (let i = 1; i <= 6; i++) {
      await user.click(dayBtns[i]);
    }
    await user.type(screen.getByPlaceholderText("e.g. Metformin"), "Aspirin");
    await user.click(screen.getByText("Save 1 medication"));
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        schedules: expect.arrayContaining([
          expect.objectContaining({ days_of_week: "mon" }),
        ]),
      })
    );
  });
});
