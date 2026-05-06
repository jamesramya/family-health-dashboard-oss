import { describe, it, expect } from "vitest";
import { formatMedName } from "./medNames";

describe("formatMedName", () => {
  it("returns BRAND (GENERIC) when both are present", () => {
    expect(formatMedName("Losartan", "losartan potassium")).toBe("LOSARTAN (LOSARTAN POTASSIUM)");
  });

  it("returns BRAND only when generic is null/empty", () => {
    expect(formatMedName("Metformin", null)).toBe("METFORMIN");
    expect(formatMedName("Metformin", "")).toBe("METFORMIN");
    expect(formatMedName("Metformin", undefined)).toBe("METFORMIN");
  });

  it("does not add parens when brand equals generic (case-insensitive)", () => {
    expect(formatMedName("paracetamol", "Paracetamol")).toBe("PARACETAMOL");
  });

  it("trims whitespace before comparing + uppercasing", () => {
    expect(formatMedName("  Atorvastatin  ", "  atorvastatin  ")).toBe("ATORVASTATIN");
  });
});
