import { AlertCircle, Pill } from "lucide-react";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

interface Props {
  medications: Med[];
}

export function AsNeededRail({ medications }: Props) {
  const prn = medications.filter(
    (m) => m.is_active && m.schedules.some((s) => s.time_of_day === "as_needed")
  );

  if (prn.length === 0) return null;

  return (
    <div className="flex gap-4 px-5 py-4 bg-cream-50/40 rounded-2xl">
      <div className="w-24 sm:w-32 flex-shrink-0">
        <div className="flex items-center gap-2 text-ink-muted">
          <AlertCircle size={16} aria-hidden />
          <p className="text-sm font-semibold uppercase tracking-[0.12em]">As needed</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {prn.map((m) => {
          const schedule = m.schedules.find((s) => s.time_of_day === "as_needed");
          const note = schedule?.instructions;
          return (
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 border border-dashed border-cream-300 bg-white/60"
            >
              <span className="w-7 h-7 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <Pill size={14} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-semibold text-ink uppercase tracking-wide">{m.brand_name}</span>
                  {m.generic_name && (
                    <span className="text-xs text-ink-muted uppercase tracking-wider">{m.generic_name}</span>
                  )}
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  {m.dosage}
                  {m.reason ? ` · ${m.reason}` : ""}
                  {note ? ` · ${note}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
