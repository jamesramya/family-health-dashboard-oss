import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AsNeededRail } from "./AsNeededRail";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

function prn(id: string, brand: string): Med {
  return {
    id, patient_id: "p1", brand_name: brand, generic_name: brand.toLowerCase(),
    dosage: "500 mg", form: "tablet", start_date: "2026-01-01", end_date: null,
    reason: "Pain / fever", is_active: 1, notes: null, lifecycle_events: [],
    prescription_ids: [],
    schedules: [{
      id: `s-${id}`, medication_id: id, time_of_day: "as_needed",
      meal_relation: "not_applicable", dose_quantity: "1 tablet",
      specific_time: null, instructions: null, days_of_week: null,
    }],
  };
}

describe("AsNeededRail", () => {
  it("renders a row per PRN medication with brand + generic + dosage", () => {
    const { container } = render(
      <AsNeededRail medications={[prn("m1", "Paracetamol"), prn("m2", "Ibuprofen")]} />
    );
    expect(screen.getAllByText(/Paracetamol/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ibuprofen/i).length).toBeGreaterThan(0);
    expect(container.textContent).toContain("Pain / fever");
  });

  it("renders the 'As needed' rail label with an alert icon", () => {
    const { container } = render(<AsNeededRail medications={[prn("m1", "Paracetamol")]} />);
    expect(screen.getByText(/As needed/i)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders no interactive controls (no buttons, no checkboxes)", () => {
    render(<AsNeededRail medications={[prn("m1", "Paracetamol")]} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("renders nothing when no PRN meds are supplied", () => {
    const { container } = render(<AsNeededRail medications={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
