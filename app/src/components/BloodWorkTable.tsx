import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatChartDate } from "@/lib/format";
import { labStatusFor } from "@/lib/labStatus";
import { STATUS_MAP } from "@/lib/status";
import { CellSpark } from "./ui/CellSpark";
import { Spark } from "./ui/Spark";
import type {
  BloodWorkCategory,
  BloodWorkCategoryItem,
  TestCategory,
  TestResult,
} from "@/types/api";

interface BloodWorkTableProps {
  categories: BloodWorkCategory[];
  visibleDates?: Set<string>;
  onRowTap?: (test: BloodWorkCategoryItem, category: TestCategory) => void;
}

const CATEGORY_LABELS: Record<TestCategory, string> = {
  haematology: "Haematology (CBC)",
  electrolytes: "Electrolytes",
  liver_function: "Liver Function",
  renal_function: "Renal Function",
  bone_profile: "Bone Profile",
  coagulation: "Coagulation",
  drug_levels: "Drug Levels",
  inflammatory: "Inflammatory Markers",
  thyroid_function: "Thyroid Function",
  blood_glucose: "Blood Glucose",
  lipid_profile: "Lipid Profile",
  other: "Other",
};

const STATUS_BG: Partial<Record<string, string>> = {
  below: "bg-rose-50/50",
  above: "bg-rose-50/50",
  "borderline-low": "bg-amber-50/50",
  "borderline-high": "bg-amber-50/50",
};

const STATUS_TEXT: Partial<Record<string, string>> = {
  below: "text-rose-600",
  above: "text-rose-600",
  "borderline-low": "text-amber-600",
  "borderline-high": "text-amber-600",
};

const STATUS_FLAG: Partial<Record<string, string>> = {
  below: "LOW",
  "borderline-low": "LOW",
  above: "HIGH",
  "borderline-high": "HIGH",
};

function refRangeLabel(
  test: Pick<BloodWorkCategoryItem, "ref_low" | "ref_high" | "unit">
): string {
  const u = test.unit ? ` ${test.unit}` : "";
  if (test.ref_low != null && test.ref_high != null) return `${test.ref_low}–${test.ref_high}${u}`;
  if (test.ref_low != null) return `≥ ${test.ref_low}${u}`;
  if (test.ref_high != null) return `≤ ${test.ref_high}${u}`;
  return "";
}

function priorReadingBefore(readings: TestResult[], date: string): TestResult | null {
  const candidates = readings
    .filter((r) => r.value != null && r.date < date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

function CategoryAccordion({
  group,
  visibleDates,
  onRowTap,
}: {
  group: BloodWorkCategory;
  visibleDates?: Set<string>;
  onRowTap?: (test: BloodWorkCategoryItem, category: TestCategory) => void;
}) {
  const [open, setOpen] = useState(true);
  const [scrollable, setScrollable] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const abnormalCount = group.tests.reduce((count, test) => {
    const latest = [...test.readings].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return count;
    const status = labStatusFor(latest, test.ref_low, test.ref_high);
    return ["below", "above", "borderline-low", "borderline-high"].includes(status) ? count + 1 : count;
  }, 0);

  const dateSet = new Set<string>();
  for (const test of group.tests) {
    for (const r of test.readings) {
      if (!visibleDates || visibleDates.has(r.date)) dateSet.add(r.date);
    }
  }
  const allDates = [...dateSet].sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      setScrollable(el.scrollWidth > el.clientWidth + 2);
      setAtEnd(Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, [open, allDates.length]);

  useEffect(() => {
    if (open && scrollRef.current && typeof window !== "undefined" && window.innerWidth >= 768) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [open, allDates.length]);

  return (
    <div className="bg-white rounded-2xl border border-cream-200 shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-cream-50 transition-colors duration-200 border-b border-cream-200"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown size={16} className="text-ink-faint flex-shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" aria-hidden />
          )}
          <h3 className="font-sans text-lg font-semibold tracking-[-0.01em] text-ink">
            {CATEGORY_LABELS[group.category] ?? group.category}
          </h3>
          <span className="text-xs text-ink-muted">{group.tests.length} {group.tests.length === 1 ? "test" : "tests"}</span>
        </div>
        {abnormalCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-600">
            <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#c9942b" }} />
            {abnormalCount} outside range
          </span>
        )}
      </button>

      <div
        className="grid transition-[grid-template-rows] duration-250 ease-out-strong"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div
            ref={scrollRef}
            className="labs-scroll overflow-x-auto"
            data-scrollable={scrollable && !atEnd ? "true" : "false"}
            data-at-end={atEnd ? "true" : "false"}
          >
            <table className="text-sm table-fixed">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th
                    data-testid="labs-sticky-col"
                    className="sticky left-0 z-10 bg-cream-50 text-left px-3 py-2 font-semibold text-ink-faint uppercase tracking-[0.14em] text-[11px] w-[140px] min-w-[140px] sm:w-[220px] sm:min-w-[220px]"
                  >
                    Test
                  </th>
                  <th className="sticky left-[140px] sm:left-[220px] z-10 bg-cream-50 py-2 pr-3 pl-2 font-semibold text-ink-faint uppercase tracking-[0.14em] text-[11px] shadow-[1px_0_0_0_#e8dfc4] w-[104px] min-w-[104px]">
                    Trend
                  </th>
                  {allDates.map((d, i) => {
                    const isLatest = i === allDates.length - 1;
                    return (
                      <th
                        key={d}
                        className="text-center px-3 py-2 font-semibold text-ink-faint uppercase tracking-[0.14em] text-[11px] whitespace-nowrap w-[108px] min-w-[108px]"
                      >
                        <div className="flex flex-col items-center leading-tight">
                          <span>{formatChartDate(d)}</span>
                          {isLatest && (
                            <span className="text-[9px] font-normal text-teal-600 mt-0.5 normal-case tracking-normal">
                              latest
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {group.tests.map((test) => {
                  const byDate = new Map(test.readings.map((r) => [r.date, r]));
                  const refLabel = refRangeLabel(test);
                  const rowLabel = `Open ${test.label} detail`;

                  const sortedNewestFirst = [...test.readings].sort((a, b) => b.date.localeCompare(a.date));
                  const latestReading = sortedNewestFirst[0];
                  const latestStatus = latestReading
                    ? labStatusFor(latestReading, test.ref_low, test.ref_high)
                    : "nodata";
                  const sparkColor = STATUS_MAP[latestStatus].dot;
                  const sparkValues = sortedNewestFirst
                    .map((r) => r.value)
                    .filter((v): v is number => v != null);

                  return (
                    <tr key={test.id} className="hover:bg-cream-50">
                      <td
                        data-testid="labs-sticky-col"
                        className="sticky left-0 z-10 bg-white hover:bg-cream-50 px-3 py-2 w-[140px] min-w-[140px] sm:w-[220px] sm:min-w-[220px]"
                      >
                        {onRowTap ? (
                          <button
                            type="button"
                            aria-label={rowLabel}
                            onClick={() => onRowTap(test, group.category)}
                            className="w-full text-left lg:pointer-events-none lg:cursor-default"
                          >
                            <div className="font-medium text-ink leading-tight">{test.label}</div>
                            {refLabel && (
                              <div className="text-[11px] text-ink-muted tabular leading-tight mt-0.5">
                                {refLabel}
                              </div>
                            )}
                          </button>
                        ) : (
                          <>
                            <div className="font-medium text-ink leading-tight">{test.label}</div>
                            {refLabel && (
                              <div className="text-[11px] text-ink-muted tabular leading-tight mt-0.5">
                                {refLabel}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                      <td
                        data-testid="trend-spark"
                        className="sticky left-[140px] sm:left-[220px] z-10 bg-white hover:bg-cream-50 py-2 pr-3 pl-2 align-middle shadow-[1px_0_0_0_#e8dfc4] w-[104px] min-w-[104px]"
                      >
                        <Spark
                          values={sparkValues}
                          low={test.ref_low ?? undefined}
                          high={test.ref_high ?? undefined}
                          width={90}
                          height={30}
                          color={sparkColor}
                        />
                      </td>
                      {allDates.map((d) => {
                        const r = byDate.get(d);
                        if (!r) {
                          return (
                            <td
                              key={d}
                              className="px-3 py-2 text-center text-ink-faint w-[108px] min-w-[108px]"
                            >
                              —
                            </td>
                          );
                        }
                        const status = labStatusFor(r, test.ref_low, test.ref_high);
                        const prior = priorReadingBefore(test.readings, r.date);
                        const display = r.value != null ? String(r.value) : r.value_text ?? "—";
                        const bgClass = STATUS_BG[status] ?? "";
                        const textClass = STATUS_TEXT[status] ?? "text-ink";
                        const flag = STATUS_FLAG[status];

                        return (
                          <td
                            key={d}
                            className={`px-3 py-2 text-center w-[108px] min-w-[108px] tabular ${bgClass}`}
                          >
                            <div className={`flex items-center justify-center gap-1 ${textClass}`}>
                              {flag && (
                                <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">
                                  {flag}
                                </span>
                              )}
                              {r.report_file ? (
                                <a
                                  href={r.report_file}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:underline font-semibold"
                                  title="View source report"
                                >
                                  {display}
                                </a>
                              ) : (
                                <span className="font-semibold">{display}</span>
                              )}
                            </div>
                            <div data-testid="cell-spark" className="mt-1">
                              <CellSpark
                                prev={prior?.value ?? null}
                                curr={r.value}
                                low={test.ref_low}
                                high={test.ref_high}
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BloodWorkTable({ categories, visibleDates, onRowTap }: BloodWorkTableProps) {
  if (categories.length === 0) {
    return (
      <p className="text-center text-ink-muted py-12">No blood work results found.</p>
    );
  }
  return (
    <div className="space-y-4">
      {categories.map((group) => (
        <CategoryAccordion
          key={group.category}
          group={group}
          visibleDates={visibleDates}
          onRowTap={onRowTap}
        />
      ))}
    </div>
  );
}
