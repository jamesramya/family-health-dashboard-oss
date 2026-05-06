import { useMemo } from "react";
import type { Medication, MedicationSchedule } from "@/types/api";

type Med = Medication & { schedules: MedicationSchedule[] };

export function useMedicationSearch(meds: Med[], query: string): Med[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meds;
    return meds.filter(
      (m) =>
        m.brand_name.toLowerCase().includes(q) ||
        (m.generic_name ?? "").toLowerCase().includes(q)
    );
  }, [meds, query]);
}
