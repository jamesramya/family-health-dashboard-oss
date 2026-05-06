import { describe, it, expect } from "vitest";
import { formatStatusEnglish, personStatusFromAlerts } from "./status";

describe("formatStatusEnglish", () => {
  it("returns 'No reading' when value is null", () => {
    expect(formatStatusEnglish(null, 3.5, 5.5)).toBe("No reading");
  });

  it("returns 'No reading' when low is null", () => {
    expect(formatStatusEnglish(4.0, null, 5.5)).toBe("No reading");
  });

  it("returns 'No reading' when high is null", () => {
    expect(formatStatusEnglish(4.0, 3.5, null)).toBe("No reading");
  });

  it("returns 'In range' when value is within bounds", () => {
    expect(formatStatusEnglish(4.5, 3.5, 5.5)).toBe("In range");
  });

  it("returns 'Slightly low' when value is borderline-low", () => {
    expect(formatStatusEnglish(3.4, 3.5, 5.5)).toBe("Slightly low");
  });

  it("returns 'Slightly high' when value is borderline-high", () => {
    expect(formatStatusEnglish(5.6, 3.5, 5.5)).toBe("Slightly high");
  });

  it("returns 'Below normal' when value is well below range", () => {
    expect(formatStatusEnglish(1.0, 3.5, 5.5)).toBe("Below normal");
  });

  it("returns 'Above normal' when value is well above range", () => {
    expect(formatStatusEnglish(10.0, 3.5, 5.5)).toBe("Above normal");
  });
});

describe("personStatusFromAlerts", () => {
  it("returns 'well' when alerts array is empty", () => {
    expect(personStatusFromAlerts([])).toBe("well");
  });

  it("returns 'watch' when highest tone is amber", () => {
    expect(personStatusFromAlerts([{ tone: "sage" }, { tone: "amber" }])).toBe("watch");
  });

  it("returns 'attention' when any alert has rose tone", () => {
    expect(personStatusFromAlerts([{ tone: "amber" }, { tone: "rose" }])).toBe("attention");
  });

  it("returns 'well' when all tones are sage or muted", () => {
    expect(personStatusFromAlerts([{ tone: "sage" }, { tone: "muted" }])).toBe("well");
  });
});
