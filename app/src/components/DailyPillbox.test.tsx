import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DailyPillbox } from "./DailyPillbox";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

function mkMed(id: string, brand: string, slot: string, time?: string): Med {
  return {
    id, patient_id: "p1", brand_name: brand, generic_name: brand.toLowerCase(),
    dosage: "5 mg", form: "tablet", start_date: "2026-01-01", end_date: null,
    reason: null, is_active: 1, notes: null, lifecycle_events: [], prescription_ids: [],
    schedules: [{
      id: `s-${id}`, medication_id: id, time_of_day: slot,
      meal_relation: "after_meal", dose_quantity: "1 tablet",
      specific_time: time ?? null, instructions: null, days_of_week: null,
    }],
  };
}

const MEDS: Med[] = [
  mkMed("m1", "Losartan",    "morning",   "08:00"),
  mkMed("m2", "Metformin",   "morning",   "08:00"),
  mkMed("m3", "Atorvastatin","night",     "22:00"),
  mkMed("m4", "Paracetamol", "as_needed"),
];

describe("DailyPillbox", () => {
  beforeEach(() => localStorage.clear());

  it("renders four time slots in order", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    const slots = screen.getAllByTestId("pillbox-slot");
    expect(slots.map((s) => s.getAttribute("data-slot"))).toEqual([
      "morning", "afternoon", "evening", "night",
    ]);
  });

  it("places each medication into its scheduled slot (ALL CAPS)", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/LOSARTAN/)).toBeInTheDocument();
    expect(within(morning).getByText(/METFORMIN/)).toBeInTheDocument();
    const night = screen.getByTestId("pillbox-slot-night");
    expect(within(night).getByText(/ATORVASTATIN/)).toBeInTheDocument();
  });

  it("excludes 'as_needed' medications from the fixed slots", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    for (const slot of ["morning", "afternoon", "evening", "night"]) {
      const el = screen.getByTestId(`pillbox-slot-${slot}`);
      expect(within(el).queryByText(/PARACETAMOL/)).not.toBeInTheDocument();
    }
  });

  it("clicking a dose checkbox persists to localStorage", async () => {
    const user = userEvent.setup();
    render(<DailyPillbox medications={MEDS} personId="p1" date="2026-04-24" />);
    const cb = screen.getByRole("checkbox", { name: /LOSARTAN/i });
    await user.click(cb);
    const raw = localStorage.getItem("meds.dispense.p1.2026-04-24");
    // key is now medId:slot:days_of_week — null days_of_week normalises to "all"
    expect(raw).toContain('"m1:morning:all":true');
  });

  it("clicking 'Next day' shifts the header date forward and resets ticks", async () => {
    const user = userEvent.setup();
    render(<DailyPillbox medications={MEDS} personId="p1" date="2026-04-24" />);
    await user.click(screen.getByRole("checkbox", { name: /LOSARTAN/i }));
    await user.click(screen.getByRole("button", { name: /next day/i }));
    expect(screen.getByTestId("pillbox-header-date")).toHaveTextContent(/25 Apr/);
    expect(screen.getByRole("checkbox", { name: /LOSARTAN/i })).toHaveAttribute("aria-checked", "false");
  });

  it("dose rows render as role=checkbox elements", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("taken dose checkbox flips aria-checked to true", async () => {
    const user = userEvent.setup();
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    const cb = screen.getByRole("checkbox", { name: /LOSARTAN/i });
    expect(cb).toHaveAttribute("aria-checked", "false");
    await user.click(cb);
    expect(cb).toHaveAttribute("aria-checked", "true");
  });

  it("highlights the current slot with a 'Now' chip", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T09:00:00"));
    render(<DailyPillbox medications={MEDS} personId="p1" date="2026-04-24" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/now/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("renders 'Pillbox · Demo' eyebrow when personName is provided", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" personName="Demo" />);
    expect(screen.getByText(/pillbox · demo/i)).toBeInTheDocument();
  });

  it("shows dispensed counter 'Dispensed 0 / 3' initially (3 non-as_needed meds)", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" date="2026-04-24" />);
    expect(screen.getByText(/dispensed 0 \/ 3/i)).toBeInTheDocument();
  });

  it("taken med checkbox shows sage-filled circle", async () => {
    localStorage.setItem(
      "meds.dispense.p1.2026-04-24",
      JSON.stringify({ "m1:morning:all": true })
    );
    const { container } = render(<DailyPillbox medications={MEDS} personId="p1" date="2026-04-24" />);
    const taken = container.querySelector('[aria-checked="true"]');
    expect(taken).not.toBeNull();
    const circle = taken?.querySelector("span[aria-hidden]");
    expect(circle?.className).toContain("bg-sage-500");
  });

  it("date display uses Inter semibold, not Instrument Serif", () => {
    render(<DailyPillbox medications={MEDS} personId="p1" />);
    const dateEl = screen.getByTestId("pillbox-header-date");
    expect(dateEl.className).not.toContain("font-serif");
    expect(dateEl.className).not.toContain("font-display");
    expect(dateEl.className).toContain("font-semibold");
  });
});

describe("DailyPillbox — per-day variable dosing", () => {
  beforeEach(() => localStorage.clear());

  const eltroxin: Med = {
    id: "e1",
    patient_id: "p1",
    brand_name: "Eltroxin",
    generic_name: "levothyroxine",
    dosage: "75 mcg",
    form: "tablet",
    start_date: "2026-01-01",
    end_date: null,
    reason: null,
    is_active: 1,
    notes: null,
    lifecycle_events: [],
    prescription_ids: [],
    schedules: [
      {
        id: "s-e1a",
        medication_id: "e1",
        time_of_day: "morning",
        meal_relation: "empty_stomach",
        dose_quantity: "75 mcg",
        specific_time: null,
        instructions: null,
        days_of_week: "mon,tue,wed,thu,fri",
      },
      {
        id: "s-e1b",
        medication_id: "e1",
        time_of_day: "morning",
        meal_relation: "empty_stomach",
        dose_quantity: "100 mcg",
        specific_time: null,
        instructions: null,
        days_of_week: "sat,sun",
      },
    ],
  };

  it("on a Wednesday shows 75 mcg row for Eltroxin, not 100 mcg", () => {
    // 2026-04-29 is a Wednesday
    render(<DailyPillbox medications={[eltroxin]} personId="p1" date="2026-04-29" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/75 mcg/i)).toBeInTheDocument();
    expect(within(morning).queryByText(/100 mcg/i)).not.toBeInTheDocument();
  });

  it("on a Saturday shows 100 mcg row for Eltroxin, not 75 mcg", () => {
    // 2026-05-02 is a Saturday
    render(<DailyPillbox medications={[eltroxin]} personId="p1" date="2026-05-02" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/100 mcg/i)).toBeInTheDocument();
    expect(within(morning).queryByText(/75 mcg/i)).not.toBeInTheDocument();
  });

  it("med with null days_of_week shows every day (legacy compat)", () => {
    const legacy: Med = {
      ...eltroxin,
      id: "e2",
      schedules: [{
        id: "s-e2",
        medication_id: "e2",
        time_of_day: "morning",
        meal_relation: "after_meal",
        dose_quantity: "50 mg",
        specific_time: null,
        instructions: null,
        days_of_week: null,
      }],
    };
    render(<DailyPillbox medications={[legacy]} personId="p1" date="2026-04-29" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/50 mg/i)).toBeInTheDocument();
  });

  it("med with no dose_quantity falls back to med.dosage", () => {
    const noQty: Med = {
      ...eltroxin,
      id: "e3",
      dosage: "25 mg",
      schedules: [{
        id: "s-e3",
        medication_id: "e3",
        time_of_day: "morning",
        meal_relation: "after_meal",
        dose_quantity: "",
        specific_time: null,
        instructions: null,
        days_of_week: "all",
      }],
    };
    render(<DailyPillbox medications={[noQty]} personId="p1" date="2026-04-29" />);
    const morning = screen.getByTestId("pillbox-slot-morning");
    expect(within(morning).getByText(/25 mg/i)).toBeInTheDocument();
  });
});
