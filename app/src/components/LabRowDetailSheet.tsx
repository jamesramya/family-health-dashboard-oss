import { useMemo, useState } from "react";
import { Share2, X } from "lucide-react";
import { BottomSheet } from "./BottomSheet";
import { Spark } from "./ui/Spark";
import { StatusPill } from "./ui/StatusPill";
import { Btn } from "./ui/Btn";
import { labStatusFor } from "@/lib/labStatus";
import { formatDate } from "@/lib/format";
import type { BloodWorkCategoryItem, TestResult } from "@/types/api";

type Period = "6m" | "1y" | "all";

const PERIOD_DAYS: Record<Period, number | null> = {
  "6m": 183,
  "1y": 365,
  all: null,
};

interface Props {
  test: BloodWorkCategoryItem;
  categoryLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

function refRangeLabel(low: number | null, high: number | null, unit: string | null): string {
  const u = unit ? ` ${unit}` : "";
  if (low != null && high != null) return `${low}–${high}${u}`;
  if (low != null) return `≥ ${low}${u}`;
  if (high != null) return `≤ ${high}${u}`;
  return "";
}

function deltaSince(prev: TestResult | undefined, curr: TestResult | undefined): string | null {
  if (prev?.value == null || curr?.value == null) return null;
  const d = curr.value - prev.value;
  const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "•";
  const monthYear = new Date(prev.date).toLocaleString("en", { month: "short" });
  return `${arrow} ${Math.abs(d).toFixed(1)} since ${monthYear}`;
}

export function LabRowDetailSheet({ test, categoryLabel, isOpen, onClose }: Props) {
  const [period, setPeriod] = useState<Period>("6m");

  const chronological = useMemo(
    () => [...test.readings].sort((a, b) => a.date.localeCompare(b.date)),
    [test.readings]
  );
  const newestFirst = useMemo(
    () => [...test.readings].sort((a, b) => b.date.localeCompare(a.date)),
    [test.readings]
  );

  const filtered = useMemo(() => {
    const days = PERIOD_DAYS[period];
    if (days == null) return chronological;
    const cutoff = Date.now() - days * 86_400_000;
    return chronological.filter((r) => new Date(r.date).getTime() >= cutoff);
  }, [chronological, period]);

  const latest = newestFirst[0];
  const prior = newestFirst[1];
  const delta = deltaSince(prior, latest);
  const latestStatus = latest ? labStatusFor(latest, test.ref_low, test.ref_high) : "nodata";

  const latestPdf = newestFirst.find((r) => r.report_file)?.report_file ?? null;
  const refLabel = refRangeLabel(test.ref_low, test.ref_high, test.unit);

  const chartValues = filtered.map((r) => r.value).filter((v): v is number => v != null);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} heightPercent={88} footer={
      <div className="flex gap-2 px-1">
        {latestPdf ? (
          <a
            href={latestPdf}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 h-12 rounded-xl bg-cream-200 text-ink font-medium text-sm inline-flex items-center justify-center"
          >
            View source PDF
          </a>
        ) : (
          <Btn variant="secondary" size="lg" className="flex-1" disabled>
            No source PDF
          </Btn>
        )}
        <button
          type="button"
          aria-label="Share"
          className="h-12 w-12 rounded-xl bg-cream-200 text-ink-soft grid place-items-center"
        >
          <Share2 size={16} />
        </button>
      </div>
    }>
      <div className="px-5 pt-2 pb-4 flex items-start justify-between border-b border-cream-300">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            Blood · {categoryLabel}
          </p>
          <h2 className="font-semibold tracking-tight text-3xl text-ink leading-tight mt-1">{test.label}</h2>
          {refLabel && (
            <p className="text-xs text-ink-muted mt-1 tabular">ref {refLabel}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full bg-cream-200 grid place-items-center text-ink-soft"
        >
          <X size={14} />
        </button>
      </div>

      {latest && (
        <div className="px-5 py-5 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Latest · {formatDate(latest.date)}
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                data-testid="lab-sheet-hero-value"
                className="font-semibold text-[54px] text-ink leading-none tabular"
              >
                {latest.value ?? latest.value_text ?? "—"}
              </span>
              <span data-testid="lab-sheet-hero-unit" className="text-sm text-ink-muted tabular">
                {test.unit ?? ""}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusPill status={latestStatus} />
            {delta && (
              <p className="text-[11px] font-medium text-ink-muted tabular">{delta}</p>
            )}
          </div>
        </div>
      )}

      <div className="px-3 pb-3">
        <div className="bg-cream-100 rounded-2xl p-3">
          <div className="flex justify-between items-center px-1 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              Trend · {filtered.length} readings
            </p>
            <div role="tablist" className="flex gap-1">
              {(["6m", "1y", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={period === p}
                  onClick={() => setPeriod(p)}
                  className={`h-6 px-2 rounded-full text-[10px] font-medium ${
                    period === p ? "bg-teal-500 text-cream-50" : "text-ink-muted"
                  }`}
                >
                  {p === "all" ? "All" : p}
                </button>
              ))}
            </div>
          </div>
          <Spark
            values={[...chartValues].reverse()}
            low={test.ref_low ?? undefined}
            high={test.ref_high ?? undefined}
            width={320}
            height={120}
            color={latestStatus === "below" || latestStatus === "above" ? "#bc4a38" : "#2f6b5f"}
          />
        </div>
        <p className="text-[11px] text-ink-muted mt-2 px-1 flex items-center gap-2">
          <span className="inline-block w-3 h-2 rounded" style={{ background: "#eef4ea" }} />
          reference range · {refLabel}
        </p>
      </div>

      <div className="px-3 pb-5" data-testid="lab-sheet-readings">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint px-2 mb-2">
          All readings
        </p>
        {newestFirst.map((r, i) => {
          const status = labStatusFor(r, test.ref_low, test.ref_high);
          return (
            <div
              key={r.id}
              data-testid="lab-sheet-reading"
              className={`flex items-center justify-between px-3 py-3 rounded-xl ${
                i === 0 ? "bg-cream-100" : ""
              }`}
            >
              <div>
                <p className="text-[13px] text-ink font-medium">{formatDate(r.date)}</p>
                <p className="text-[11px] text-ink-muted tabular">
                  {r.source_lab ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular text-[15px] text-ink">
                  {r.value ?? r.value_text ?? "—"}
                </span>
                {status !== "in-range" && status !== "nodata" && (
                  <StatusPill status={status} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </BottomSheet>
  );
}
