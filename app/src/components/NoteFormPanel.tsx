import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useForm } from "react-hook-form";
import { useCreateNote, useUpdateNote, useNotes } from "@/hooks/use-notes";
import { useDocuments } from "@/hooks/use-documents";
import { useAICapabilities } from "@/hooks/use-ai-capabilities";
import { loadVoiceSettings } from "@/lib/voice-settings";
import { VoiceRecorderPanel } from "@/components/notes/VoiceRecorderPanel";
import { formatDate } from "@/lib/format";
import { Btn } from "@/components/ui";
import type { ClinicalNote, Document } from "@/types/api";

export interface NoteFormData {
  visit_date: string;
  doctor_name: string;
  facility: string;
  diagnosis: string;
  summary: string;
  treatment_plan: string;
}

type AttachMode = "none" | "existing" | "upload";

export function NoteFormPanel({
  patientId,
  existing,
  onSuccess,
  onCancel,
}: {
  patientId: string;
  existing?: ClinicalNote;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const createNote = useCreateNote(patientId);
  const updateNote = useUpdateNote(patientId, existing?.id ?? "");
  const { data: docsData } = useDocuments(patientId);
  const { data: capabilities } = useAICapabilities();
  const voiceSettings = loadVoiceSettings();

  const sortedDocs: Document[] = [...(docsData?.documents ?? [])].sort(
    (a, b) => new Date(b.document_date).getTime() - new Date(a.document_date).getTime()
  );

  const [attachMode, setAttachMode] = useState<AttachMode>(
    existing?.document_id ? "existing" : "none"
  );
  const [selectedDocId, setSelectedDocId] = useState<string>(existing?.document_id ?? "");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingRecording, setPendingRecording] = useState<{
    blob: Blob;
    durationSec: number;
  } | null>(null);

  const { data: notesData } = useNotes(patientId);

  const doctorOptions = useMemo(() => {
    const names = (notesData?.notes ?? [])
      .map((n) => n.doctor_name)
      .filter((v): v is string => Boolean(v));
    return [...new Set(names)];
  }, [notesData?.notes]);

  const facilityOptions = useMemo(() => {
    const names = (notesData?.notes ?? [])
      .map((n) => n.facility)
      .filter((v): v is string => Boolean(v));
    return [...new Set(names)];
  }, [notesData?.notes]);

  const { register, handleSubmit } = useForm<NoteFormData>({
    defaultValues: existing
      ? {
          visit_date: existing.visit_date ?? "",
          doctor_name: existing.doctor_name ?? "",
          facility: existing.facility ?? "",
          diagnosis: existing.diagnosis ?? "",
          summary: existing.summary ?? "",
          treatment_plan: existing.treatment_plan ?? "",
        }
      : {},
  });

  async function onSubmit(data: NoteFormData) {
    if (attachMode === "upload" && !uploadFile) {
      setUploadError("Please select a file to upload.");
      return;
    }

    let docId: string | null | undefined;

    if (attachMode === "upload" && uploadFile) {
      setUploadError(null);
      setIsUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", uploadFile);
        fd.append("title", uploadFile.name.replace(/\.[^.]+$/, ""));
        fd.append("type", "other");
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        fd.append("document_date", localDate);
        const res = await fetch(`/api/patients/${patientId}/documents/upload`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const json = (await res.json()) as { document: Document };
        docId = json.document.id;
      } catch {
        setUploadError("Upload failed. Please try again.");
        setIsUploading(false);
        return;
      }
      setIsUploading(false);
    } else if (attachMode === "existing") {
      docId = selectedDocId || undefined;
    } else {
      docId = existing?.document_id ? null : undefined;
    }

    if (existing) {
      updateNote.mutate(
        {
          visit_date: data.visit_date || undefined,
          doctor_name: data.doctor_name || undefined,
          facility: data.facility || undefined,
          diagnosis: data.diagnosis || undefined,
          summary: data.summary || undefined,
          treatment_plan: data.treatment_plan || undefined,
          document_id: docId,
        },
        { onSuccess }
      );
    } else {
      const fd = new FormData();
      if (data.visit_date) fd.append("visit_date", data.visit_date);
      if (data.summary) fd.append("summary", data.summary);
      if (data.doctor_name) fd.append("doctor_name", data.doctor_name);
      if (data.facility) fd.append("facility", data.facility);
      if (data.diagnosis) fd.append("diagnosis", data.diagnosis);
      if (data.treatment_plan) fd.append("treatment_plan", data.treatment_plan);
      if (docId) fd.append("document_id", docId);
      if (pendingRecording) {
        fd.append("audio", pendingRecording.blob, "recording.webm");
        fd.append("audio_duration_sec", String(pendingRecording.durationSec));
        const shouldTranscribe = voiceSettings.autoTranscribe && (capabilities?.deepgram ?? false);
        fd.append("transcribe", String(shouldTranscribe));
      }
      createNote.mutate(fd, { onSuccess });
    }
  }

  const isPending = createNote.isPending || updateNote.isPending || isUploading;
  const inputCls = "w-full border border-cream-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong text-ink";
  const labelCls = "block text-sm font-medium text-ink-muted mb-1";
  const tabBtnCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium rounded-lg border ${
      active
        ? "bg-teal-500 text-white border-teal-500"
        : "bg-white text-ink-soft border-cream-300 hover:bg-cream-50"
    }`;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {voiceSettings.enabled && !existing && (
        <VoiceRecorderPanel onRecording={setPendingRecording} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Visit Date</label>
          <input type="date" {...register("visit_date")} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Doctor</label>
          <input
            type="text"
            {...register("doctor_name")}
            list={`doctor-suggestions-${patientId}`}
            placeholder="Dr. Smith"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Facility</label>
          <input
            type="text"
            {...register("facility")}
            list={`facility-suggestions-${patientId}`}
            placeholder="e.g. City Hospital"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Diagnosis</label>
          <input type="text" {...register("diagnosis")} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Summary</label>
          <textarea
            {...register("summary")}
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Treatment Plan</label>
          <textarea
            {...register("treatment_plan")}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>
      </div>

      <div className="border border-cream-200 rounded-2xl">
        <button
          type="button"
          onClick={() => setAttachMode(attachMode === "none" ? "existing" : "none")}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink-soft hover:bg-cream-50 rounded-2xl"
        >
          <span className="font-medium">
            {attachMode !== "none" ? "Attached document" : "Attach document (optional)"}
          </span>
          {attachMode !== "none"
            ? <ChevronUp size={14} className="text-ink-faint flex-shrink-0" />
            : <ChevronDown size={14} className="text-ink-faint flex-shrink-0" />
          }
        </button>

        {attachMode !== "none" && (
          <div className="px-4 pb-4 space-y-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => { setAttachMode("existing"); setUploadFile(null); setUploadError(null); }} className={tabBtnCls(attachMode === "existing")}>
                Link existing
              </button>
              <button type="button" onClick={() => { setAttachMode("upload"); setSelectedDocId(""); }} className={tabBtnCls(attachMode === "upload")}>
                Upload new
              </button>
              <button
                type="button"
                onClick={() => { setAttachMode("none"); setSelectedDocId(""); setUploadFile(null); setUploadError(null); }}
                className="ml-auto px-3 py-1.5 text-xs text-ink-faint hover:text-ink-soft"
              >
                Remove
              </button>
            </div>

            {attachMode === "existing" && (
              <div className="relative">
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="w-full border border-cream-300 rounded-xl px-3 py-2 text-base appearance-none pr-8 text-ink bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                >
                  <option value="">Select a document…</option>
                  {sortedDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} — {formatDate(d.document_date)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              </div>
            )}

            {attachMode === "upload" && (
              <div className="space-y-2">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.heic"
                  onChange={(e) => { setUploadFile(e.target.files?.[0] ?? null); setUploadError(null); }}
                  className="w-full text-base text-ink-soft file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
                />
                {uploadFile && <p className="text-xs text-ink-faint">{uploadFile.name}</p>}
                {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <datalist id={`doctor-suggestions-${patientId}`}>
        {doctorOptions.map((name) => <option key={name} value={name} />)}
      </datalist>
      <datalist id={`facility-suggestions-${patientId}`}>
        {facilityOptions.map((name) => <option key={name} value={name} />)}
      </datalist>

      <div className="flex gap-2">
        <Btn type="submit" disabled={isPending}>
          {isUploading ? "Uploading…" : isPending ? "Saving…" : existing ? "Update Note" : "Add Note"}
        </Btn>
        <Btn variant="ghost" type="button" onClick={onCancel}>
          Cancel
        </Btn>
      </div>
    </form>
  );
}
