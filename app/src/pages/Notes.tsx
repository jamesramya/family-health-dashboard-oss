import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useNotes } from "@/hooks/use-notes";
import { useDocuments } from "@/hooks/use-documents";
import { useDefaultPatientId } from "@/hooks/use-admin";
import { NoteFormPanel } from "@/components/NoteFormPanel";
import { NoteCard } from "@/components/notes/NoteCard";
import { groupNotesByMonth } from "@/lib/notes-grouping";
import { Btn, Card, SectionHeader } from "@/components/ui";
import type { ClinicalNote } from "@/types/api";

export function Notes() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<ClinicalNote | null>(null);
  const [searchParams] = useSearchParams();

  const { data, isLoading, error, refetch } = useNotes(patientId ?? "");
  const { data: docsData } = useDocuments(patientId ?? "");

  const groups = useMemo(() => groupNotesByMonth(data?.notes ?? []), [data?.notes]);
  const docsMap = new Map((docsData?.documents ?? []).map((d) => [d.id, d]));

  useEffect(() => {
    const focusId = searchParams.get("focus");
    if (!focusId) return;
    const el = document.getElementById(`note-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [groups, searchParams]);

  if (patientLoading) return <div className="py-16 text-center text-ink-muted">Loading…</div>;
  if (!patientId) return <p className="py-16 text-center text-ink-muted">No patient found. Complete setup first.</p>;

  function handleEdit(note: ClinicalNote) { setEditingNote(note); setShowForm(true); }
  function handleClose() { setShowForm(false); setEditingNote(null); }

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Journal"
        title="A shared journal"
        subtitle={data ? `${data.notes.length} visit notes` : "Symptoms, doctor's notes, diet changes, plans — anything worth remembering."}
        action={
          <Btn icon={<Plus size={14} />} onClick={() => { setEditingNote(null); setShowForm((s) => !s); }}>
            {showForm && !editingNote ? "Cancel" : "Write a note"}
          </Btn>
        }
      />

      {showForm && (
        <Card>
          <h2 className="text-base font-semibold text-ink mb-4">
            {editingNote ? "Edit note" : "Add clinical note"}
          </h2>
          <NoteFormPanel
            patientId={patientId}
            existing={editingNote ?? undefined}
            onSuccess={handleClose}
            onCancel={handleClose}
          />
        </Card>
      )}

      {error && (
        <Card className="border-rose-100 bg-rose-50">
          <p className="text-sm text-rose-600">Failed to load notes.</p>
          <button onClick={() => void refetch()} className="mt-1 text-sm text-teal-600 hover:text-teal-700">
            Try again
          </button>
        </Card>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-ink-muted">Loading…</div>
      ) : groups.length === 0 ? (
        <div className="py-12 text-center">
          <p className="font-serif text-2xl text-ink-muted">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.month}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{g.month}</h3>
                <div className="flex-1 h-px bg-cream-200" />
              </div>
              <div className="space-y-3">
                {g.notes.map((n) => (
                  <NoteCard
                    key={n.id}
                    note={n}
                    patientId={patientId}
                    sourceDoc={n.document_id ? docsMap.get(n.document_id) : undefined}
                    onEdit={handleEdit}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
