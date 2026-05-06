import { describe, it, expect } from "vitest";
import { formatVitalDate, formatChartDate, formatDate, formatDateTime, formatRelativeTime } from "@/lib/format";

describe("formatDate", () => {
  it("produces D MMM YYYY format", () => {
    const result = formatDate("2026-04-21T10:30:00.000Z");
    // e.g. "21 Apr 2026"
    expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/);
  });

  it("contains the correct year", () => {
    expect(formatDate("2026-04-21T00:00:00.000Z")).toContain("2026");
  });

  it("contains Apr for April", () => {
    expect(formatDate("2026-04-21T00:00:00.000Z")).toContain("Apr");
  });
});

describe("formatDateTime", () => {
  it("starts with D MMM YYYY date", () => {
    const result = formatDateTime("2026-04-21T10:30:00.000Z");
    expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4},/);
  });

  it("ends with H:MM AM or PM", () => {
    const result = formatDateTime("2026-04-21T10:30:00.000Z");
    expect(result).toMatch(/\d+:\d{2} [AP]M$/);
  });

  it("separates date and time with ', '", () => {
    const result = formatDateTime("2026-04-21T10:30:00.000Z");
    const parts = result.split(", ");
    expect(parts.length).toBe(2);
  });
});

describe("formatVitalDate", () => {
  it("contains the year from the ISO string", () => {
    const result = formatVitalDate("2026-04-20T10:30:00.000Z");
    expect(result).toContain("2026");
  });

  it("ends with AM or PM", () => {
    const result = formatVitalDate("2026-04-20T10:30:45.000Z");
    expect(result).toMatch(/[AP]M$/);
    expect((result.match(/:/g) ?? []).length).toBe(1);
  });

  it("matches D MMM YYYY, H:MM AM/PM format", () => {
    const result = formatVitalDate("2026-04-20T10:30:00.000Z");
    // e.g. "20 Apr 2026, 10:30 AM"
    expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d+:\d{2} [AP]M$/);
  });
});

describe("formatChartDate", () => {
  it("returns D MMM label", () => {
    const result = formatChartDate("2026-04-20T10:30:00.000Z");
    // e.g. "20 Apr"
    expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });

  it("handles month-end dates", () => {
    const result = formatChartDate("2026-12-31T23:59:00.000Z");
    expect(result).toMatch(/^\d{1,2} [A-Z][a-z]{2}$/);
  });
});

describe("formatRelativeTime", () => {
  it("returns 'just now' for null input", () => {
    expect(formatRelativeTime(null)).toBe("just now");
  });

  it("returns 'just now' for undefined input", () => {
    expect(formatRelativeTime(undefined)).toBe("just now");
  });

  it("returns 'just now' for a timestamp 30 seconds ago", () => {
    const iso = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("just now");
  });

  it("returns '2 minutes ago' for a timestamp 2 minutes ago", () => {
    const iso = new Date(Date.now() - 2 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("2 minutes ago");
  });

  it("returns '3 hours ago' for a timestamp 3 hours ago", () => {
    const iso = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("3 hours ago");
  });

  it("returns '2 days ago' for a timestamp 2 days ago", () => {
    const iso = new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString();
    expect(formatRelativeTime(iso)).toBe("2 days ago");
  });
});
