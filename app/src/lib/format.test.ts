import { describe, it, expect } from "vitest";
import { formatRelativeTime, formatLogTime } from "./format";

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

describe("formatLogTime", () => {
  it("returns 'Today' prefix for a timestamp from the current day", () => {
    const now = new Date().toISOString();
    expect(formatLogTime(now)).toMatch(/^Today · \d{2}:\d{2}:\d{2}$/);
  });

  it("returns 'Yesterday' prefix for a timestamp exactly 25 hours ago", () => {
    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(formatLogTime(yesterday)).toMatch(/^Yesterday · \d{2}:\d{2}:\d{2}$/);
  });

  it("returns date prefix for a timestamp from 48+ hours ago", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(formatLogTime(twoDaysAgo)).toMatch(
      /^\d{1,2} [A-Z][a-z]{2} · \d{2}:\d{2}:\d{2}$/
    );
  });

  it("accepts a number (ms) as input", () => {
    const nowMs = Date.now();
    expect(formatLogTime(nowMs)).toMatch(
      /^(Today|Yesterday|\d{1,2} [A-Z][a-z]{2}) · \d{2}:\d{2}:\d{2}$/
    );
  });

  it("matches overall format shape", () => {
    const timestamp = new Date().toISOString();
    expect(formatLogTime(timestamp)).toMatch(
      /^(Today|Yesterday|\d{1,2} [A-Z][a-z]{2}) · \d{2}:\d{2}:\d{2}$/
    );
  });
});
