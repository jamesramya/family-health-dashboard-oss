import { useState } from "react";
import { formatChartDate } from "@/lib/format";
import { labStatusFor } from "@/lib/labStatus";
import { STATUS_MAP } from "@/lib/status";
import { Spark } from "./ui/Spark";
import type { BloodWorkCategory, BloodWorkCategoryItem, TestCategory } from "@/types/api";

type Range = "6m" | "1y" | "all";

const RANGE_DAYS: Record<Range, number | null> = {
  "6m": 183,
  "1y": 365,
  all: null,
};

const FLAG_LABELS: Partial<Record<string, string>> = {
  below: "LOW",
  "borderline-low": "LOW",
  above: "HIGH",
  "borderline-high": "HIGH",
};

interface BloodWorkMobileListProps {
  categories: BloodWorkCategory[];
  onRowTap?: (test: BloodWorkCategoryItem, category: TestCategory) => void;
}

export function BloodWorkMobileList({ categories, onRowTap }: BloodWorkMobileListProps) {
  const [range, setRange] = useState<Range>("6m");

  const cutoffMs = RANGE_DAYS[range] != null
    ? Date.now() - (RANGE_DAYS[range] as number) * 86_400_000
    : null;

  const tests: { test: BloodWorkCategoryItem; category: TestCategory }[] = categories.flatMap(
    (cat) => cat.tests.map((t) => ({ test: t, category: cat.category }))
  );

  return (
    <div className="space-y-3">
      {/* Range filter */}
      <div className="flex gap-2">
        {(["6m", "1y", "all"] as Range[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`h-9 px-3 rounded-full text-[12px] font-medium transition-colors ${
              range === r ? "bg-cream-300 text-ink" : "bg-cream-100 text-ink-soft"
            }`}
          >
            {r === "all" ? "All" : r}
          </button>
        ))}
      </div>

      {/* Test cards */}
      <div className="space-y-1">
        {tests.map(({ test, category }) => {
          const sortedNewestFirst = [...test.readings].sort((a, b) => b.date.localeCompare(a.date));
          const latest = sortedNewestFirst[0];
          if (!latest) return null;

          const latestStatus = labStatusFor(latest, test.ref_low, test.ref_high);
          const sparkColor = STATUS_MAP[latestStatus].dot;
          const flag = FLAG_LABELS[latestStatus];

          const rangeReadings = cutoffMs != null
            ? sortedNewestFirst.filter((r) => new Date(r.date).getTime() >= cutoffMs)
            : sortedNewestFirst;
          const sparkValues = rangeReadings
            .map((r) => r.value)
            .filter((v): v is number => v != null);

          const displayValue = latest.value != null ? String(latest.value) : latest.value_text ?? "—";

          return (
            <button
              key={test.id}
              type="button"
              className="w-full text-left p-3 rounded-2xl flex items-center gap-3 bg-cream-50 border border-cream-300"
              onClick={() => onRowTap?.(test, category)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink">{test.label}</p>
                <p className="text-[11px] text-ink-muted font-mono mt-0.5">
                  latest · {formatChartDate(latest.date)}
                </p>
              </div>
              <div data-testid="mobile-test-spark">
                <Spark values={sparkValues} low={test.ref_low ?? undefined} high={test.ref_high ?? undefined} width={70} height={28} color={sparkColor} />
              </div>
              <div className="text-right min-w-[48px]">
                <p className="text-[15px] font-mono tabular text-ink leading-tight">{displayValue}</p>
                {flag ? (
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${latestStatus === "above" || latestStatus === "below" ? "text-rose-600" : "text-amber-600"}`}>
                    {flag}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono text-ink-faint">{test.unit ?? ""}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
