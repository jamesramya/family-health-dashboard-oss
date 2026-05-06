import { describe, it, expect } from "vitest";
import { labStatusFor } from "./labStatus";
import type { TestResult } from "@/types/api";

function r(partial: Partial<TestResult>): TestResult {
  return {
    id: "r1", patient_id: "p1", test_def_id: "t1", document_id: null,
    date: "2026-04-14", value: null, value_text: null, flag: null,
    source_lab: null, report_file: null,
    ...partial,
  };
}

describe("labStatusFor", () => {
  it("returns 'nodata' when value is null and value_text is present", () => {
    expect(labStatusFor(r({ value: null, value_text: "Not detected" }), 0, 1)).toBe("nodata");
  });

  it("returns 'nodata' when value and range are both null", () => {
    expect(labStatusFor(r({ value: null }), null, null)).toBe("nodata");
  });

  it("prefers HIGH flag over numeric status", () => {
    expect(labStatusFor(r({ value: 12, flag: "HIGH" }), 4, 10)).toBe("above");
  });

  it("prefers LOW flag over numeric status", () => {
    expect(labStatusFor(r({ value: 3, flag: "LOW" }), 4, 10)).toBe("below");
  });

  it("downgrades NORMAL flag near the edge to borderline via numeric check", () => {
    // flag=NORMAL but value is 4% above high → numeric check returns borderline-high
    expect(labStatusFor(r({ value: 10.4, flag: "NORMAL" }), 4, 10)).toBe("borderline-high");
  });

  it("uses numeric status when flag is absent", () => {
    expect(labStatusFor(r({ value: 7 }), 4, 10)).toBe("in-range");
    expect(labStatusFor(r({ value: 11 }), 4, 10)).toBe("above");
  });
});
