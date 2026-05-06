export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_ORDER: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];

const DAY_ABBREV: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu",
  fri: "Fri", sat: "Sat", sun: "Sun",
};

// Converts legacy full-name format ("monday,tuesday") to short keys ("mon,tue")
const FULL_TO_SHORT: Record<string, DayKey> = {
  monday:"mon", tuesday:"tue", wednesday:"wed", thursday:"thu",
  friday:"fri", saturday:"sat", sunday:"sun",
};

function canonicalize(daysField: string): string {
  return daysField.split(",").map((d) => FULL_TO_SHORT[d] ?? d).join(",");
}

export function dayMatches(daysField: string | null, dayKey: DayKey): boolean {
  if (daysField === null || daysField === "all") return true;
  const normalized = canonicalize(daysField);
  if (normalized === dayKey) return true;
  return normalized.split(",").includes(dayKey);
}

export function normalizeDays(selected: DayKey[]): string {
  if (selected.length === 0 || selected.length === 7) return "all";
  const ordered = DAY_ORDER.filter((d) => selected.includes(d));
  if (ordered.length === 1) return ordered[0];
  return ordered.join(",");
}

export function splitForOtherDays(currentDays: string): { kept: string; other: string } {
  const keptSet: DayKey[] = currentDays === "all"
    ? ["mon","tue","wed","thu","fri"]
    : (currentDays.split(",") as DayKey[]);
  const keptOrdered = DAY_ORDER.filter((d) => keptSet.includes(d));
  const otherOrdered = DAY_ORDER.filter((d) => !keptSet.includes(d));
  return {
    kept: keptOrdered.join(","),
    other: otherOrdered.join(","),
  };
}

export function formatDayBadge(daysField: string | null): string {
  if (!daysField || daysField === "all") return "Daily";

  const normalized = canonicalize(daysField);
  const days = normalized.split(",") as DayKey[];

  // All 7 days stored as full names → "Daily"
  if (days.length === 7 && days.every((d) => DAY_ORDER.includes(d))) return "Daily";

  if (days.length === 1) return DAY_ABBREV[days[0]];

  const indices = days.map((d) => DAY_ORDER.indexOf(d)).sort((a, b) => a - b);
  const isContiguous = indices.every((idx, i) => i === 0 || idx === indices[i - 1] + 1);

  if (isContiguous && days.length > 2) {
    return `${DAY_ABBREV[DAY_ORDER[indices[0]]]}–${DAY_ABBREV[DAY_ORDER[indices[indices.length - 1]]]}`;
  }
  if (isContiguous && days.length === 2) {
    return `${DAY_ABBREV[DAY_ORDER[indices[0]]]}–${DAY_ABBREV[DAY_ORDER[indices[1]]]}`;
  }

  return days.map((d) => DAY_ABBREV[d]).join(", ");
}
