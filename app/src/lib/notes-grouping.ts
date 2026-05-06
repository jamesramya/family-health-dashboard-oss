import type { ClinicalNote } from "@/types/api";

export interface NoteGroup {
  month: string; // "April 2026" or "Undated"
  notes: ClinicalNote[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function groupNotesByMonth(notes: ClinicalNote[]): NoteGroup[] {
  const dated: Record<string, ClinicalNote[]> = {};
  const undated: ClinicalNote[] = [];

  for (const n of notes) {
    if (!n.visit_date) { undated.push(n); continue; }
    const d = new Date(n.visit_date);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    (dated[key] ??= []).push(n);
  }

  const groups: NoteGroup[] = Object.entries(dated)
    .sort(([a], [b]) => (a > b ? -1 : 1))
    .map(([key, list]) => {
      const [yr, mo] = key.split("-");
      list.sort((a, b) => (b.visit_date! > a.visit_date! ? 1 : -1));
      return { month: `${MONTHS[Number(mo)]} ${yr}`, notes: list };
    });

  if (undated.length) groups.push({ month: "Undated", notes: undated });
  return groups;
}
