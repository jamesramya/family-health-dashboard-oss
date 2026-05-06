import { describe, it, expect, beforeEach } from "vitest";
import { getDispensations, setDispensation, toggleDispensation } from "./medDispense";

describe("medDispense", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty object when no data is stored", () => {
    expect(getDispensations("p1", "2026-04-24")).toEqual({});
  });

  it("round-trips a single dispensation", () => {
    setDispensation("p1", "2026-04-24", "med1", "morning", true);
    expect(getDispensations("p1", "2026-04-24")).toEqual({ "med1:morning": true });
  });

  it("toggles an existing entry off", () => {
    setDispensation("p1", "2026-04-24", "med1", "morning", true);
    toggleDispensation("p1", "2026-04-24", "med1", "morning");
    expect(getDispensations("p1", "2026-04-24")["med1:morning"]).toBeFalsy();
  });

  it("scopes by personId and date separately", () => {
    setDispensation("p1", "2026-04-24", "med1", "morning", true);
    setDispensation("p2", "2026-04-24", "med1", "morning", true);
    setDispensation("p1", "2026-04-25", "med1", "morning", true);

    expect(getDispensations("p1", "2026-04-24")["med1:morning"]).toBe(true);
    expect(getDispensations("p2", "2026-04-24")["med1:morning"]).toBe(true);
    expect(getDispensations("p1", "2026-04-25")["med1:morning"]).toBe(true);
    expect(getDispensations("p1", "2026-04-26")).toEqual({});
  });
});
