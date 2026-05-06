import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMedications } from "@/hooks/use-medications";
import { formatMedName } from "@/lib/medNames";
import { formatDate, formatDateTime } from "@/lib/format";
import { formatDayBadge } from "@/lib/medSchedule";

const SLOTS = ["morning", "afternoon", "evening", "night", "as_needed"] as const;
const SLOT_LABELS: Record<(typeof SLOTS)[number], string> = {
  morning: "Morning", afternoon: "Afternoon", evening: "Evening",
  night: "Night", as_needed: "As needed",
};

export function MedicationsPrint() {
  const [params] = useSearchParams();
  const personId = params.get("person") ?? "";
  const date = params.get("date") ?? new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useMedications(personId, true);

  useEffect(() => {
    if (!isLoading && data) {
      const t = setTimeout(() => window.print(), 200);
      return () => clearTimeout(t);
    }
  }, [isLoading, data]);

  if (isLoading) return <p className="p-8">Preparing schedule…</p>;
  const meds = data?.medications ?? [];

  return (
    <main className="meds-print mx-auto max-w-[800px] p-10 bg-white text-black">
      <header className="mb-6 border-b-2 border-black pb-3">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-semibold tracking-tight text-3xl">Daily medication schedule</h1>
            <p className="text-sm text-ink-soft mt-1">Family Health Record</p>
          </div>
          <div className="text-right text-sm text-ink-soft">
            <p>{formatDate(date)}</p>
            <p className="mt-0.5">{meds.length} medication{meds.length === 1 ? "" : "s"}</p>
          </div>
        </div>
      </header>

      <div className="relative border-l-2 border-black ml-4 space-y-0">
        {SLOTS.flatMap((slot) =>
          meds.flatMap((m) =>
            m.schedules
              .filter((s) => s.time_of_day === slot)
              .map((s) => (
                <div key={`${m.id}-${s.id}`} className="relative pl-6 pb-4">
                  <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-black bg-white" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-0.5">
                    {SLOT_LABELS[slot]}
                    {s.specific_time ? ` · ${s.specific_time}` : ""}
                  </p>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-black">{formatMedName(m.brand_name, m.generic_name)}</p>
                      <p className="text-xs text-ink-soft">
                        {s.dose_quantity || (m.dosage ?? "")}
                        {s.days_of_week && s.days_of_week !== "all" && (
                          <span className="ml-2 font-medium">{formatDayBadge(s.days_of_week)}</span>
                        )}
                      </p>
                    </div>
                    <span className="inline-block border-2 border-black w-6 h-6 flex-shrink-0" />
                  </div>
                </div>
              ))
          )
        )}
      </div>

      <footer className="mt-6 text-xs text-ink-soft">
        Printed {formatDateTime(new Date().toISOString())}
      </footer>
    </main>
  );
}
