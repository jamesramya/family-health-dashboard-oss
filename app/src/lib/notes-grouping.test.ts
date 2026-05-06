import { describe, it, expect } from "vitest";
import { groupNotesByMonth } from "./notes-grouping";
import type { ClinicalNote } from "@/types/api";

function note(id: string, visit_date: string | null): ClinicalNote {
  return {
    id,
    patient_id: "p1",
    visit_date,
    doctor_name: null,
    facility: null,
    diagnosis: null,
    summary: null,
    treatment_plan: null,
    document_id: null,
    created_at: "2026-01-01T00:00:00Z",
  } as unknown as ClinicalNote;
}

describe("groupNotesByMonth", () => {
  it("returns an empty array for no notes", () => {
    expect(groupNotesByMonth([])).toEqual([]);
  });

  it("groups notes by YYYY-MM and orders groups newest-first", () => {
    const notes = [
      note("a", "2026-04-03"),
      note("b", "2026-04-19"),
      note("c", "2026-02-11"),
      note("d", "2025-12-30"),
    ];
    const out = groupNotesByMonth(notes);
    expect(out.map((g) => g.month)).toEqual(["April 2026", "February 2026", "December 2025"]);
  });

  it("orders notes within a month newest-first", () => {
    const notes = [note("old", "2026-04-03"), note("new", "2026-04-19")];
    const g = groupNotesByMonth(notes);
    expect(g[0].notes.map((n) => n.id)).toEqual(["new", "old"]);
  });

  it("puts undated notes in a trailing 'Undated' bucket", () => {
    const out = groupNotesByMonth([note("a", "2026-04-03"), note("b", null)]);
    expect(out.at(-1)?.month).toBe("Undated");
    expect(out.at(-1)?.notes.map((n) => n.id)).toEqual(["b"]);
  });
});
