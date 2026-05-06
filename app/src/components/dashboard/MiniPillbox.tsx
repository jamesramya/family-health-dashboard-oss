import { useMemo } from "react";
import { Pill } from "lucide-react";
import type { PillSlot, MiniMed } from "@/lib/dashboard-meds";
import type { MealRelation } from "@/types/api";

export type { PillSlot, MiniMed };

interface MiniPillboxProps {
  meds: MiniMed[];
}

const SLOT_ORDER: PillSlot[] = ["morning", "afternoon", "evening", "night"];

const SLOT_LABEL: Record<PillSlot, string> = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  night:     "Night",
};

const SLOT_DEFAULT_TIME: Record<PillSlot, string> = {
  morning:   "08:00",
  afternoon: "13:00",
  evening:   "20:00",
  night:     "22:00",
};

const MEAL_LABEL: Record<MealRelation, string> = {
  before_meal:    "before food",
  after_meal:     "after food",
  with_meal:      "with food",
  empty_stomach:  "empty stomach",
  not_applicable: "",
};

function shortDose(dose: string): string {
  return dose.split(/\s+/).slice(0, 2).join(" ");
}

export function MiniPillbox({ meds }: MiniPillboxProps) {
  const grouped = useMemo(() => {
    const by: Record<PillSlot, MiniMed[]> = {
      morning: [], afternoon: [], evening: [], night: [],
    };
    for (const m of meds) by[m.slot].push(m);
    return by;
  }, [meds]);

  const rows = SLOT_ORDER
    .map((slot) => ({ slot, meds: grouped[slot] }))
    .filter((r) => r.meds.length > 0);

  if (rows.length === 0) {
    return <p className="text-sm text-ink-faint py-2">No medications scheduled</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(({ slot, meds: slotMeds }) => {
        const time = slotMeds.find((m) => m.specific_time)?.specific_time ?? SLOT_DEFAULT_TIME[slot];
        const mealLabel = MEAL_LABEL[slotMeds[0].meal_relation];
        const subtitle = mealLabel ? `${SLOT_LABEL[slot]} · ${mealLabel}` : SLOT_LABEL[slot];
        return (
          <div
            key={slot}
            data-testid={`pillbox-row-${slot}`}
            className="flex gap-3 py-2 border-b border-cream-200 last:border-0"
          >
            <div className="w-[72px] flex-shrink-0">
              <p className="font-sans text-[20px] font-semibold tracking-[-0.01em] tabular text-ink leading-tight">{time}</p>
              <p className="text-[11px] text-ink-muted leading-snug">{subtitle}</p>
            </div>
            <div className="flex-1 flex flex-wrap gap-1.5 items-start">
              {slotMeds.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 bg-cream-100 border border-cream-200 rounded-full pl-0.5 pr-2.5 py-0.5 text-[13px]"
                >
                  <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center flex-shrink-0">
                    <Pill size={11} aria-hidden />
                  </span>
                  <span className="font-medium">{m.brand_name}</span>
                  <span className="text-ink-faint text-[11px]">{shortDose(m.dose)}</span>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
