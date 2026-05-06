import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { BloodWorkAlert } from "@/types/api";
import { statusForValue, STATUS_MAP } from "@/lib/status";
import { StatusPill } from "@/components/ui/StatusPill";

interface AttentionStripProps {
  alerts: BloodWorkAlert[];
}

export function AttentionStrip({ alerts: raw }: AttentionStripProps) {
  const alerts = raw.reduce<BloodWorkAlert[]>((acc, a) => {
    const key = a.label.toLowerCase().trim();
    const i = acc.findIndex((x) => x.label.toLowerCase().trim() === key);
    if (i === -1) return [...acc, a];
    if (a.date > acc[i].date) {
      const next = [...acc];
      next[i] = a;
      return next;
    }
    return acc;
  }, []);

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-sage-600">
        <CheckCircle2 size={16} aria-hidden />
        <span>All clear — nothing needing attention today.</span>
      </div>
    );
  }

  return (
    <div className="bg-cream-50/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" aria-hidden />
          Things to look at
        </h3>
        <Link to="/blood-work" className="text-sm text-teal-600 hover:underline">
          See all labs →
        </Link>
      </div>
      <div
        data-testid="attention-grid"
        className="grid grid-cols-1 md:grid-cols-2 gap-2"
      >
        {alerts.slice(0, 6).map((a) => {
          const s = statusForValue(a.value, a.ref_low_at_test ?? null, a.ref_high_at_test ?? null);
          const tone = STATUS_MAP[s];
          return (
            <Link
              key={a.id}
              to="/blood-work"
              className="flex items-center gap-3 rounded-xl border border-cream-200 bg-white px-4 py-3 [@media(hover:hover)]:hover:border-teal-500 transition-colors"
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: tone.dot }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink truncate">{a.label}</p>
                <p className="text-xs text-ink-muted truncate">{a.category}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-sans text-xl font-semibold text-ink tabular">
                  {a.value ?? "—"}
                  {a.unit ? <span className="text-sm font-normal text-ink-faint ml-1">{a.unit}</span> : null}
                </p>
                <div className="text-[11px] mt-0.5">
                  <StatusPill status={s} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
