import type { Medication, MedicationSchedule, MealRelation } from "@/types/api";

export type PillSlot = "morning" | "afternoon" | "evening" | "night";

export interface MiniMed {
  id: string;
  brand_name: string;
  dose: string;
  slot: PillSlot;
  specific_time?: string | null;
  meal_relation: MealRelation;
}

function slotOf(timeOfDay: string): PillSlot {
  const k = timeOfDay.toLowerCase();
  if (k.startsWith("morning")) return "morning";
  if (k.startsWith("afternoon") || k.startsWith("noon")) return "afternoon";
  if (k.startsWith("evening")) return "evening";
  return "night";
}

type MedWithSchedules = Medication & { schedules: MedicationSchedule[] };

export function buildMiniMeds(medications: MedWithSchedules[]): MiniMed[] {
  const out: MiniMed[] = [];
  for (const m of medications) {
    if (!m.is_active) continue;
    const first = m.schedules?.[0];
    if (!first) continue;
    out.push({
      id: m.id,
      brand_name: m.brand_name,
      dose: [first.dose_quantity, m.dosage].filter(Boolean).join(" · "),
      slot: slotOf(first.time_of_day),
      specific_time: first.specific_time ?? null,
      meal_relation: first.meal_relation,
    });
  }
  return out;
}
