import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Btn } from "./ui/Btn";
import { Card } from "./ui/Card";
import { formatMedName } from "@/lib/medNames";
import { formatChartDate } from "@/lib/format";
import { getDispensations, toggleDispensationByKey, type Slot } from "@/lib/medDispense";
import { dayMatches, type DayKey } from "@/lib/medSchedule";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

const SLOTS: readonly { id: Slot; label: string; hourStart: number; hourEnd: number }[] = [
  { id: "morning",   label: "Morning",   hourStart: 5,  hourEnd: 11 },
  { id: "afternoon", label: "Afternoon", hourStart: 11, hourEnd: 16 },
  { id: "evening",   label: "Evening",   hourStart: 16, hourEnd: 20 },
  { id: "night",     label: "Night",     hourStart: 20, hourEnd: 29 },
] as const;

function addDays(iso: string, delta: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + delta);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function currentSlot(now: Date): Slot | null {
  const h = now.getHours() + (now.getHours() < 5 ? 24 : 0);
  const match = SLOTS.find((s) => h >= s.hourStart && h < s.hourEnd);
  return match?.id ?? null;
}

interface Props {
  medications: Med[];
  personId: string;
  date?: string;
  personName?: string;
}

export function DailyPillbox({ medications, personId, date, personName }: Props) {
  const [current, setCurrent] = useState(date ?? todayIso());
  const [dispense, setDispense] = useState(() => getDispensations(personId, current));

  useEffect(() => {
    setDispense(getDispensations(personId, current));
  }, [personId, current]);

  const nowSlot = currentSlot(new Date());
  const isToday = current === todayIso();

  const currentDayKey = useMemo((): DayKey => {
    const d = new Date(current + "T12:00:00");
    return (["sun","mon","tue","wed","thu","fri","sat"][d.getDay()] as DayKey);
  }, [current]);

  // Each entry: the med, the matching schedule row, and a dispense key
  type SlotEntry = { med: Med; sch: MedicationSchedule; dispenseKey: string };

  const bySlot = useMemo(() => {
    const map = new Map<Slot, SlotEntry[]>();
    for (const s of SLOTS) map.set(s.id, []);
    for (const med of medications) {
      if (!med.is_active) continue;
      for (const sch of med.schedules) {
        if (sch.time_of_day === "as_needed") continue;
        const slot = (SLOTS.find((s) => s.id === sch.time_of_day)?.id ?? null) as Slot | null;
        if (!slot) continue;
        if (!dayMatches(sch.days_of_week, currentDayKey)) continue;
        const dispenseKey = `${med.id}:${slot}:${sch.days_of_week ?? "all"}`;
        map.get(slot)!.push({ med, sch, dispenseKey });
      }
    }
    return map;
  }, [medications, currentDayKey]);

  const dispensedCount = Object.values(dispense).filter(Boolean).length;
  const totalCount = SLOTS.reduce((sum, s) => sum + (bySlot.get(s.id)?.length ?? 0), 0);

  function handleToggle(dispenseKey: string) {
    toggleDispensationByKey(personId, current, dispenseKey);
    setDispense(getDispensations(personId, current));
  }

  return (
    <Card className="p-5 space-y-4">
      {personName && (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">
          Pillbox · {personName}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => setCurrent((d) => addDays(d, -1))}
            className="w-9 h-9 rounded-full bg-cream-100 grid place-items-center text-ink-soft hover:bg-cream-200"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <p data-testid="pillbox-header-date" className="text-2xl font-semibold text-ink">
            {formatChartDate(current + "T12:00:00")}
            {isToday && <span className="ml-2 text-[11px] font-sans font-semibold uppercase tracking-[0.14em] text-teal-600 align-middle">Today</span>}
          </p>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => setCurrent((d) => addDays(d, 1))}
            className="w-9 h-9 rounded-full bg-cream-100 grid place-items-center text-ink-soft hover:bg-cream-200"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <span className="text-xs text-ink-muted">
          Dispensed {dispensedCount} / {totalCount}
        </span>
        {!isToday && (
          <Btn variant="ghost" size="sm" onClick={() => setCurrent(todayIso())}>
            Today
          </Btn>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {SLOTS.map((s) => {
          const entries = bySlot.get(s.id) ?? [];
          const isNow = isToday && nowSlot === s.id;
          return (
            <div
              key={s.id}
              data-testid="pillbox-slot"
              data-slot={s.id}
            >
            <div
              data-testid={`pillbox-slot-${s.id}`}
              className={`rounded-2xl border p-4 ${
                isNow ? "bg-teal-50 border-teal-500/30" : "bg-cream-50 border-cream-200"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  {s.label}
                </p>
                {isNow && (
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] bg-teal-600 text-cream-50 px-2 py-0.5 rounded-full">
                    Now
                  </span>
                )}
              </div>

              {entries.length === 0 ? (
                <p className="text-xs text-ink-faint py-2">Nothing scheduled.</p>
              ) : (
                <div className="space-y-1">
                  {entries.map(({ med, sch, dispenseKey }) => {
                    const taken = !!dispense[dispenseKey];
                    const doseLabel = sch.dose_quantity || med.dosage;
                    return (
                      <button
                        key={dispenseKey}
                        type="button"
                        role="checkbox"
                        aria-checked={taken}
                        aria-label={formatMedName(med.brand_name, med.generic_name)}
                        onClick={() => handleToggle(dispenseKey)}
                        className="w-full flex items-center gap-3 min-h-[56px] px-2 rounded-xl hover:bg-cream-100 text-left"
                      >
                        <span
                          aria-hidden
                          className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            taken
                              ? "bg-sage-500 border-sage-500"
                              : "border-cream-300 bg-white"
                          }`}
                        >
                          {taken && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <div className="flex-1">
                          <p className={`text-[13px] font-semibold text-ink ${taken ? "line-through opacity-60" : ""}`}>
                            {formatMedName(med.brand_name, med.generic_name)}
                          </p>
                          <p className="text-[11px] text-ink-muted tabular">
                            {doseLabel}
                            {sch.specific_time && (
                              <span className="font-mono"> · {sch.specific_time}</span>
                            )}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
