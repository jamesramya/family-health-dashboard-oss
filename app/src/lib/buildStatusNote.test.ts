import { describe, it, expect } from "vitest";
import { buildStatusNote } from "./buildStatusNote";

describe("buildStatusNote", () => {
  it("says 'Recent labs look good' when no alerts", () => {
    expect(buildStatusNote(3, 0)).toMatch(/Recent labs look good/);
  });

  it("says 'N lab results outside the normal range' when alerts > 1", () => {
    expect(buildStatusNote(3, 5)).toMatch(/5 lab results outside the normal range/);
  });

  it("uses singular when exactly 1 alert", () => {
    expect(buildStatusNote(3, 1)).toMatch(/1 lab result outside the normal range/);
  });

  it("says 'Taking N medications' in first sentence when meds > 1", () => {
    expect(buildStatusNote(2, 0)).toMatch(/Taking 2 medications/);
  });

  it("uses singular when exactly 1 medication", () => {
    expect(buildStatusNote(1, 0)).toMatch(/Taking 1 medication\b/);
  });

  it("says 'Doing well overall' when no meds and no alerts", () => {
    expect(buildStatusNote(0, 0)).toMatch(/Doing well overall/);
  });

  it("omits 'Doing well overall' prefix when no meds but has alerts", () => {
    expect(buildStatusNote(0, 3)).not.toMatch(/Doing well overall/);
    expect(buildStatusNote(0, 3)).toMatch(/3 lab results outside the normal range/);
  });
});
