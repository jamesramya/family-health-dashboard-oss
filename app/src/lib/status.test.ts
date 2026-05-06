import { describe, it, expect } from "vitest";
import { statusForValue, STATUS_MAP, PERSON_STATUS_MAP } from "./status";

describe("statusForValue", () => {
  it("returns 'nodata' when any argument is null", () => {
    expect(statusForValue(null, 4, 10)).toBe("nodata");
    expect(statusForValue(7, null, 10)).toBe("nodata");
    expect(statusForValue(7, 4, null)).toBe("nodata");
    expect(statusForValue(null, null, null)).toBe("nodata");
  });

  it("returns 'in-range' for a value inside [low, high]", () => {
    expect(statusForValue(7, 4, 10)).toBe("in-range");
    expect(statusForValue(4, 4, 10)).toBe("in-range");
    expect(statusForValue(10, 4, 10)).toBe("in-range");
  });

  it("returns 'borderline-low' for values slightly below low (≤5% gap)", () => {
    expect(statusForValue(9.7, 10, 20)).toBe("borderline-low");
  });

  it("returns 'below' for values significantly below low (>5% gap)", () => {
    expect(statusForValue(9, 10, 20)).toBe("below");
  });

  it("returns 'borderline-high' for values slightly above high (≤5% gap)", () => {
    expect(statusForValue(20.9, 10, 20)).toBe("borderline-high");
  });

  it("returns 'above' for values significantly above high (>5% gap)", () => {
    expect(statusForValue(22, 10, 20)).toBe("above");
  });
});

describe("STATUS_MAP", () => {
  it("covers all six TestStatus values", () => {
    const keys = ["in-range", "borderline-low", "borderline-high", "below", "above", "nodata"];
    for (const k of keys) {
      expect(STATUS_MAP).toHaveProperty(k);
      expect(STATUS_MAP[k as keyof typeof STATUS_MAP].plain).toBeTruthy();
      expect(STATUS_MAP[k as keyof typeof STATUS_MAP].medical).toBeTruthy();
    }
  });
});

describe("PERSON_STATUS_MAP", () => {
  it("covers well, watch, attention", () => {
    for (const k of ["well", "watch", "attention"]) {
      expect(PERSON_STATUS_MAP).toHaveProperty(k);
    }
  });
});
