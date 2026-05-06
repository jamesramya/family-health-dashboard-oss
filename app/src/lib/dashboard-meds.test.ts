import { describe, it, expect } from "vitest";
import { buildMiniMeds } from "./dashboard-meds";
import type { Medication, MedicationSchedule } from "@/types/api";

type MedWithSchedules = Medication & { schedules: MedicationSchedule[] };

function sched(id: string, time_of_day: string, dose_quantity: string): MedicationSchedule {
  return {
    id,
    medication_id: "ignored",
    time_of_day,
    meal_relation: "not_applicable",
    dose_quantity,
    specific_time: null,
    instructions: null,
    days_of_week: null,
  };
}

function med(
  id: string,
  brand_name: string,
  schedules: MedicationSchedule[],
  is_active = 1
): MedWithSchedules {
  return {
    id,
    patient_id: "p1",
    brand_name,
    generic_name: null,
    dosage: "",
    form: "tablet",
    start_date: "2026-01-01",
    end_date: null,
    reason: null,
    is_active,
    notes: null,
    lifecycle_events: [],
    prescription_ids: [],
    schedules,
  };
}

describe("buildMiniMeds", () => {
  it("returns one entry per active medication even when it has multiple schedules", () => {
    const eltroxin = med("m1", "Eltroxin", [
      sched("s1", "morning", "75mcg"),
      sched("s2", "morning", "50mcg"),
    ]);
    const out = buildMiniMeds([eltroxin]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("m1");
  });

  it("uses the first schedule's dose and slot", () => {
    const m = med("m1", "Eltroxin", [
      sched("s1", "morning", "75mcg"),
      sched("s2", "evening", "50mcg"),
    ]);
    const out = buildMiniMeds([m]);
    expect(out[0].slot).toBe("morning");
    expect(out[0].dose).toContain("75mcg");
  });

  it("skips inactive medications", () => {
    const m = med("m1", "Aspirin", [sched("s1", "morning", "75mg")], 0);
    expect(buildMiniMeds([m])).toHaveLength(0);
  });

  it("skips medications with no schedules", () => {
    const m = med("m1", "Aspirin", []);
    expect(buildMiniMeds([m])).toHaveLength(0);
  });

  it("returns N entries for N active medications with multiple schedules each", () => {
    const meds = [
      med("m1", "Eltroxin", [sched("s1", "morning", "75mcg"), sched("s2", "morning", "50mcg")]),
      med("m2", "Metformin", [sched("s3", "evening", "500mg"), sched("s4", "night", "500mg")]),
    ];
    const out = buildMiniMeds(meds);
    expect(out).toHaveLength(2);
    expect(out.map((e) => e.id)).toEqual(["m1", "m2"]);
  });

  it("returns an empty array for no medications", () => {
    expect(buildMiniMeds([])).toEqual([]);
  });
});
