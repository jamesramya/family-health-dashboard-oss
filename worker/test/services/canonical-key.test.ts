import { describe, it, expect } from "vitest";
import { canonicalKey, titleCaseCanonicalName } from "../../src/services/canonical-key";

describe("canonicalKey", () => {
  it("lowercases and strips whitespace", () => {
    expect(canonicalKey("Haemoglobin")).toBe("haemoglobin");
    expect(canonicalKey("HAEMOGLOBIN")).toBe("haemoglobin");
    expect(canonicalKey(" haemoglobin ")).toBe("haemoglobin");
  });

  it("collapses underscores and spaces", () => {
    expect(canonicalKey("magnesium_serum")).toBe("magnesium");
    expect(canonicalKey("Platelet Count")).toBe("plateletcount");
    expect(canonicalKey("platelet_count")).toBe("plateletcount");
    expect(canonicalKey("Red Cell Count")).toBe("redcellcount");
    expect(canonicalKey("red_cell_count")).toBe("redcellcount");
  });

  it("strips specimen suffixes (serum, plasma, whole blood)", () => {
    expect(canonicalKey("Sodium, Serum")).toBe("sodium");
    expect(canonicalKey("Magnesium, Serum")).toBe("magnesium");
    expect(canonicalKey("Potassium, Plasma")).toBe("potassium");
    expect(canonicalKey("Glucose, Whole Blood")).toBe("glucose");
    expect(canonicalKey("magnesium_serum")).toBe("magnesium");
  });

  it("is idempotent", () => {
    expect(canonicalKey(canonicalKey("Sodium, Serum"))).toBe("sodium");
    expect(canonicalKey(canonicalKey("Haemoglobin"))).toBe("haemoglobin");
  });

  it("maps all 12 known duplicate groups to single keys", () => {
    expect(canonicalKey("Haemoglobin")).toBe(canonicalKey("haemoglobin"));
    expect(canonicalKey("Sodium")).toBe(canonicalKey("sodium"));
    expect(canonicalKey("Sodium")).toBe(canonicalKey("Sodium, Serum"));
    expect(canonicalKey("Potassium")).toBe(canonicalKey("potassium"));
    expect(canonicalKey("Potassium")).toBe(canonicalKey("Potassium, Serum"));
    expect(canonicalKey("Magnesium, Serum")).toBe(canonicalKey("magnesium_serum"));
    expect(canonicalKey("Platelet Count")).toBe(canonicalKey("platelet_count"));
    expect(canonicalKey("Red Cell Count")).toBe(canonicalKey("red_cell_count"));
    expect(canonicalKey("Basophils")).toBe(canonicalKey("basophils"));
    expect(canonicalKey("Eosinophils")).toBe(canonicalKey("eosinophils"));
    expect(canonicalKey("Haematocrit")).toBe(canonicalKey("haematocrit"));
    expect(canonicalKey("Lymphocytes")).toBe(canonicalKey("lymphocytes"));
    expect(canonicalKey("Monocytes")).toBe(canonicalKey("monocytes"));
    expect(canonicalKey("Neutrophils")).toBe(canonicalKey("neutrophils"));
  });

  it("throws on empty input", () => {
    expect(() => canonicalKey("")).toThrow();
    expect(() => canonicalKey("   ")).toThrow();
  });
});

describe("titleCaseCanonicalName", () => {
  it("produces Title Case display names", () => {
    expect(titleCaseCanonicalName("haemoglobin")).toBe("Haemoglobin");
    expect(titleCaseCanonicalName("platelet_count")).toBe("Platelet Count");
    expect(titleCaseCanonicalName("red cell count")).toBe("Red Cell Count");
    expect(titleCaseCanonicalName("Sodium, Serum")).toBe("Sodium");
    expect(titleCaseCanonicalName("HAEMOGLOBIN")).toBe("Haemoglobin");
  });

  it("preserves single-word inputs", () => {
    expect(titleCaseCanonicalName("sodium")).toBe("Sodium");
  });
});
