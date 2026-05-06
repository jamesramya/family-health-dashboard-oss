export type TestStatus =
  | "in-range"
  | "borderline-low"
  | "borderline-high"
  | "below"
  | "above"
  | "nodata";

export type StatusTone = "sage" | "amber" | "rose" | "muted";

export type PersonStatus = "well" | "watch" | "attention";

export interface StatusEntry {
  plain: string;
  medical: string;
  tone: StatusTone;
  dot: string;
}

export function statusForValue(
  v: number | null,
  low: number | null,
  high: number | null
): TestStatus {
  if (v == null || low == null || high == null) return "nodata";
  if (v < low) return (low - v) / low > 0.05 ? "below" : "borderline-low";
  if (v > high) return (v - high) / high > 0.05 ? "above" : "borderline-high";
  return "in-range";
}

export const STATUS_MAP: Record<TestStatus, StatusEntry> = {
  "in-range":        { plain: "In range",      medical: "Normal",          tone: "sage",  dot: "#6b9f58" },
  "borderline-low":  { plain: "Slightly low",  medical: "Borderline low",  tone: "amber", dot: "#c9942b" },
  "borderline-high": { plain: "Slightly high", medical: "Borderline high", tone: "amber", dot: "#c9942b" },
  "below":           { plain: "Below normal",  medical: "Low",             tone: "rose",  dot: "#bc4a38" },
  "above":           { plain: "Above normal",  medical: "High",            tone: "rose",  dot: "#bc4a38" },
  "nodata":          { plain: "No reading",    medical: "—",               tone: "muted", dot: "#a39d8f" },
};

export const PERSON_STATUS_MAP: Record<PersonStatus, Omit<StatusEntry, "tone"> & { tone: Exclude<StatusTone, "muted"> }> = {
  well:      { plain: "Doing well",      medical: "No issues", tone: "sage",  dot: "#6b9f58" },
  watch:     { plain: "Keep an eye on",  medical: "Watch",     tone: "amber", dot: "#c9942b" },
  attention: { plain: "Needs attention", medical: "Attention", tone: "rose",  dot: "#bc4a38" },
};

export function formatStatusEnglish(
  v: number | null,
  low: number | null,
  high: number | null
): string {
  return STATUS_MAP[statusForValue(v, low, high)].plain;
}

export function personStatusFromAlerts(alerts: { tone: StatusTone }[]): PersonStatus {
  if (alerts.some((a) => a.tone === "rose")) return "attention";
  if (alerts.some((a) => a.tone === "amber")) return "watch";
  return "well";
}
