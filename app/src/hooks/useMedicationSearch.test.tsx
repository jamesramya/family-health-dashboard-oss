import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMedicationSearch } from "./useMedicationSearch";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

const BASE: Omit<Med, "id" | "brand_name" | "generic_name"> = {
  patient_id: "p1", dosage: "5 mg", form: "tablet", start_date: "2026-01-01",
  end_date: null, reason: null, is_active: 1, notes: null,
  lifecycle_events: [], prescription_ids: [], schedules: [],
};

const FIXTURES: Med[] = [
  { ...BASE, id: "1", brand_name: "Losartan",     generic_name: "losartan potassium" },
  { ...BASE, id: "2", brand_name: "Metformin",    generic_name: "metformin hydrochloride" },
  { ...BASE, id: "3", brand_name: "Atorvastatin", generic_name: null },
];

describe("useMedicationSearch", () => {
  it("returns all medications when query is empty", () => {
    const { result } = renderHook(() => useMedicationSearch(FIXTURES, ""));
    expect(result.current.map((m) => m.id)).toEqual(["1", "2", "3"]);
  });

  it("filters by brand name (case-insensitive substring)", () => {
    const { result } = renderHook(() => useMedicationSearch(FIXTURES, "met"));
    expect(result.current.map((m) => m.id)).toEqual(["2"]);
  });

  it("filters by generic name", () => {
    const { result } = renderHook(() => useMedicationSearch(FIXTURES, "potassium"));
    expect(result.current.map((m) => m.id)).toEqual(["1"]);
  });

  it("trims whitespace and ignores case", () => {
    const { result } = renderHook(() => useMedicationSearch(FIXTURES, "  LOSART  "));
    expect(result.current.map((m) => m.id)).toEqual(["1"]);
  });

  it("returns an empty array when nothing matches", () => {
    const { result } = renderHook(() => useMedicationSearch(FIXTURES, "zzz"));
    expect(result.current).toEqual([]);
  });

  it("recomputes on query change", () => {
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) => useMedicationSearch(FIXTURES, q),
      { initialProps: { q: "" } }
    );
    expect(result.current.length).toBe(3);
    act(() => rerender({ q: "ator" }));
    expect(result.current.map((m) => m.id)).toEqual(["3"]);
  });
});
