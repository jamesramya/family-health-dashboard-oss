import { describe, it, expect } from "vitest";
import { formatRelativeTime } from "./format";

describe("formatRelativeTime", () => {
  it("returns 'just now' when lastActivity is undefined", () => {
    expect(formatRelativeTime(undefined)).toBe("just now");
  });

  it("returns 'just now' when lastActivity is null", () => {
    expect(formatRelativeTime(null)).toBe("just now");
  });

  it("returns 'just now' for a timestamp less than 60 seconds ago", () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(recent)).toBe("just now");
  });

  it("returns a string matching 'X ago' for older timestamps", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toMatch(/ ago$/);
  });

  it("returns a string matching 'X ago' for a day-old timestamp", () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(yesterday)).toMatch(/ ago$/);
  });
});
