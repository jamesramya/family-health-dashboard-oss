import { statusForValue, type TestStatus } from "./status";
import type { TestResult } from "@/types/api";

export function labStatusFor(
  reading: Pick<TestResult, "value" | "value_text" | "flag">,
  refLow: number | null,
  refHigh: number | null
): TestStatus {
  if (reading.value == null) return "nodata";

  if (reading.flag === "HIGH") return "above";
  if (reading.flag === "LOW") return "below";

  return statusForValue(reading.value, refLow, refHigh);
}
