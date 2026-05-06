import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddMedicationSheet } from "./AddMedicationSheet";

vi.mock("@/hooks/use-medications", () => ({
  useCreateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderSheet(patientName = "Demo") {
  return render(
    <AddMedicationSheet
      isOpen
      onClose={() => {}}
      patientId="p1"
      patientName={patientName}
    />
  );
}

describe("AddMedicationSheet", () => {
  it("renders the sheet title referencing the patient", () => {
    renderSheet();
    expect(screen.getByRole("heading", { name: /add to demo/i })).toBeInTheDocument();
  });

  it("renders Save button from the embedded MedicationForm", () => {
    renderSheet();
    expect(screen.getByText(/save 1 medication/i)).toBeInTheDocument();
  });

  it("renders Cancel button from the embedded MedicationForm", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("renders brand name input from embedded MedicationForm", () => {
    renderSheet();
    expect(screen.getByPlaceholderText(/e\.g\. Metformin/i)).toBeInTheDocument();
  });

  it("renders day pill buttons (per-day dosing parity with desktop)", () => {
    renderSheet();
    // M T W T F S S — 7 day pill buttons
    const dayBtns = screen.getAllByRole("button", { name: /^[MTWFS]$/ });
    expect(dayBtns.length).toBe(7);
  });

  it("shows + Other days button on the default schedule row", () => {
    renderSheet();
    expect(screen.getByRole("button", { name: /other days/i })).toBeInTheDocument();
  });
});
