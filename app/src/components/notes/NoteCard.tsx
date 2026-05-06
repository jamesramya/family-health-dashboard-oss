import { Link } from "react-router-dom";
import { Trash2, Pencil, FileText, Mic } from "lucide-react";
import { useDeleteNote, useTranscribeNote } from "@/hooks/use-notes";
import { useConfirm } from "@/hooks/use-confirm";
import { formatDate } from "@/lib/format";
import { Btn } from "@/components/ui";
import type { ClinicalNote, Document } from "@/types/api";

interface Props {
  note: ClinicalNote;
  patientId: string;
  sourceDoc?: Document;
  onEdit: (note: ClinicalNote) => void;
}

export function NoteCard({ note, patientId, sourceDoc, onEdit }: Props) {
  const deleteNote = useDeleteNote(patientId);
  const transcribeNote = useTranscribeNote(patientId);
  const confirm = useConfirm();

  return (
    <article
      id={`note-${note.id}`}
      className="bg-cream-50 rounded-2xl border border-cream-200 shadow-card p-5 scroll-mt-6"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
            {note.visit_date ? formatDate(note.visit_date) : "Undated"}
            {note.doctor_name && <span className="normal-case tracking-normal font-medium text-ink-muted"> · Dr. {note.doctor_name}</span>}
          </p>
          <h3 className="mt-1 text-ink font-semibold tracking-[-0.01em] text-[17px] leading-snug">
            {note.diagnosis ?? note.summary?.slice(0, 60) ?? "Clinical note"}
          </h3>
          {note.facility && (
            <p className="text-xs text-ink-muted mt-0.5">{note.facility}</p>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Btn variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(note)} aria-label="Edit note" />
          <Btn
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            aria-label="Delete note"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete this note?",
                message: "This will permanently remove the clinical note.",
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) deleteNote.mutate(note.id);
            }}
          />
        </div>
      </header>

      {note.summary && (
        <p className="mt-3 text-[15px] text-ink-soft leading-relaxed">{note.summary}</p>
      )}

      {note.treatment_plan && (
        <div className="mt-3 rounded-xl bg-sage-50 border border-sage-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sage-600 mb-1">Treatment plan</p>
          <p className="text-sm text-ink-soft leading-relaxed">{note.treatment_plan}</p>
        </div>
      )}

      {sourceDoc && (
        <Link
          to={`/documents?doc=${note.document_id}`}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700"
        >
          <FileText size={12} /> {sourceDoc.title}
        </Link>
      )}

      {note.audio_transcript && (
        <div className="mt-3 rounded-xl bg-teal-50 border border-teal-100 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-600 mb-1">Transcript</p>
          <p className="text-sm text-ink-soft leading-relaxed">{note.audio_transcript}</p>
        </div>
      )}

      {note.audio_r2_key && !note.audio_transcript && (
        <Btn
          variant="ghost"
          size="sm"
          icon={<Mic size={14} />}
          className="mt-2"
          disabled={transcribeNote.isPending}
          onClick={() => transcribeNote.mutate(note.id)}
          aria-label="Transcribe"
        >
          {transcribeNote.isPending ? "Transcribing…" : "Transcribe"}
        </Btn>
      )}
    </article>
  );
}
