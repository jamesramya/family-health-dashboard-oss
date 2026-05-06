import { describe, it, expect } from "vitest";
import { dayMatches, normalizeDays, splitForOtherDays, formatDayBadge } from "./medSchedule";
import type { DayKey } from "./medSchedule";

const ALL_KEYS: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];

describe("dayMatches", () => {
  it("'all' matches every day", () => {
    for (const key of ALL_KEYS) {
      expect(dayMatches("all", key)).toBe(true);
    }
  });

  it("bare day key matches only that key", () => {
    expect(dayMatches("mon", "mon")).toBe(true);
    expect(dayMatches("mon", "tue")).toBe(false);
    expect(dayMatches("sat", "sat")).toBe(true);
    expect(dayMatches("sat", "fri")).toBe(false);
  });

  it("comma-joined list matches included keys only", () => {
    expect(dayMatches("mon,tue,wed,thu,fri", "mon")).toBe(true);
    expect(dayMatches("mon,tue,wed,thu,fri", "fri")).toBe(true);
    expect(dayMatches("mon,tue,wed,thu,fri", "sat")).toBe(false);
    expect(dayMatches("mon,tue,wed,thu,fri", "sun")).toBe(false);
  });

  it("null matches every day (legacy fallback)", () => {
    for (const key of ALL_KEYS) {
      expect(dayMatches(null, key)).toBe(true);
    }
  });

  it("legacy full-name all-7 matches every day", () => {
    const legacy = "monday,tuesday,wednesday,thursday,friday,saturday,sunday";
    for (const key of ALL_KEYS) {
      expect(dayMatches(legacy, key)).toBe(true);
    }
  });

  it("legacy full-name Mon-Fri matches weekdays, not weekend", () => {
    const legacy = "monday,tuesday,wednesday,thursday,friday";
    expect(dayMatches(legacy, "mon")).toBe(true);
    expect(dayMatches(legacy, "fri")).toBe(true);
    expect(dayMatches(legacy, "sat")).toBe(false);
    expect(dayMatches(legacy, "sun")).toBe(false);
  });
});

describe("normalizeDays", () => {
  it("all 7 days → 'all'", () => {
    expect(normalizeDays(ALL_KEYS)).toBe("all");
  });

  it("single day → bare key", () => {
    expect(normalizeDays(["mon"])).toBe("mon");
    expect(normalizeDays(["sat"])).toBe("sat");
  });

  it("comma-joins in Mon→Sun order regardless of input order", () => {
    expect(normalizeDays(["sat","sun"])).toBe("sat,sun");
    expect(normalizeDays(["wed","mon","fri"])).toBe("mon,wed,fri");
    expect(normalizeDays(["sun","mon","tue","wed","thu","fri"])).toBe("mon,tue,wed,thu,fri,sun");
  });

  it("empty array → 'all' (treat empty selection as daily)", () => {
    expect(normalizeDays([])).toBe("all");
  });
});

describe("splitForOtherDays", () => {
  it("'all' → Mon-Fri kept, Sat-Sun as other", () => {
    const result = splitForOtherDays("all");
    expect(result.kept).toBe("mon,tue,wed,thu,fri");
    expect(result.other).toBe("sat,sun");
  });

  it("custom subset → complement as other", () => {
    const result = splitForOtherDays("mon,wed,fri");
    expect(result.kept).toBe("mon,wed,fri");
    expect(result.other).toBe("tue,thu,sat,sun");
  });

  it("Mon-Fri kept → Sat-Sun as other", () => {
    const result = splitForOtherDays("mon,tue,wed,thu,fri");
    expect(result.kept).toBe("mon,tue,wed,thu,fri");
    expect(result.other).toBe("sat,sun");
  });

  it("single day kept → remaining 6 as other", () => {
    const result = splitForOtherDays("mon");
    expect(result.kept).toBe("mon");
    expect(result.other).toBe("tue,wed,thu,fri,sat,sun");
  });
});

describe("formatDayBadge", () => {
  it("'all' or null → 'Daily'", () => {
    expect(formatDayBadge("all")).toBe("Daily");
    expect(formatDayBadge(null)).toBe("Daily");
  });

  it("legacy full-name all-7 days → 'Daily'", () => {
    expect(formatDayBadge("monday,tuesday,wednesday,thursday,friday,saturday,sunday")).toBe("Daily");
  });

  it("legacy full-name Mon-Fri → 'Mon–Fri'", () => {
    expect(formatDayBadge("monday,tuesday,wednesday,thursday,friday")).toBe("Mon–Fri");
  });

  it("legacy full-name Sat-Sun → 'Sat–Sun'", () => {
    expect(formatDayBadge("saturday,sunday")).toBe("Sat–Sun");
  });

  it("Mon–Fri → 'Mon–Fri'", () => {
    expect(formatDayBadge("mon,tue,wed,thu,fri")).toBe("Mon–Fri");
  });

  it("Sat–Sun → 'Sat–Sun'", () => {
    expect(formatDayBadge("sat,sun")).toBe("Sat–Sun");
  });

  it("single day → abbreviated name", () => {
    expect(formatDayBadge("mon")).toBe("Mon");
    expect(formatDayBadge("fri")).toBe("Fri");
  });

  it("non-contiguous days → comma list of abbreviations", () => {
    expect(formatDayBadge("mon,wed,fri")).toBe("Mon, Wed, Fri");
  });

  it("Tue–Thu → 'Tue–Thu'", () => {
    expect(formatDayBadge("tue,wed,thu")).toBe("Tue–Thu");
  });
});
