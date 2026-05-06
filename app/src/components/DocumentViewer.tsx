import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useDocumentFile, useExtractedData, useFullDocument } from "@/hooks/use-document-viewer";
import { useUpdateDocument, useDeleteDocument, useReprocessDocument } from "@/hooks/use-documents";
import { useReviewMedication } from "@/hooks/use-medications";
import { useConfirm } from "@/hooks/use-confirm";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { Document, DocumentType, MedicationReviewDecision, ProcessingStatus, CultureResult } from "@/types/api";
import { CULTURE_SPECIMEN_LABELS, CULTURE_STATUS_BADGE, SensitivityGrid } from "@/lib/cultures";
import { Pencil, RefreshCw, Trash2, Download } from "lucide-react";
import { ImageZoomOverlay } from "@/components/documents/ImageZoomOverlay";
import { Spinner } from "@/components/ui/Spinner";
import { useTooltipContext } from "@/components/ui/TooltipProvider";

// ── Local data-shape types (matching API responses) ─────────────────────────

interface BloodResult {
  id: string;
  label: string;
  unit: string | null;
  category: string;
  value: number | null;
  value_text: string | null;
  flag: "HIGH" | "LOW" | "NORMAL" | null;
  ref_low_at_test: number | null;
  ref_high_at_test: number | null;
  date: string;
}

interface BloodReportData {
  results: BloodResult[];
}

interface ScanFinding {
  id: string;
  scan_type: string;
  body_area: string;
  findings_summary: string;
  impression: string | null;
  ordering_doctor: string | null;
  scan_date: string;
}

interface ScansData {
  scans: ScanFinding[];
}

interface MedicationSchedule {
  time_of_day: string;
  meal_relation: string;
  dose_quantity: string;
}

interface MedicationItem {
  id: string;
  brand_name: string;
  generic_name: string | null;
  dosage: string;
  form: string;
  start_date: string;
  is_active: number;
  schedules: MedicationSchedule[];
}

interface MedicationsData {
  medications: MedicationItem[];
}

interface ClinicalNote {
  id: string;
  visit_date: string;
  doctor_name: string | null;
  facility: string | null;
  diagnosis: string | null;
  summary: string;
  treatment_plan: string | null;
}

interface NotesData {
  notes: ClinicalNote[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<DocumentType, string> = {
  blood_report: "Blood Report",
  scan: "Scan",
  ecg: "ECG",
  prescription: "Prescription",
  consultation: "Consultation",
  culture_report: "Culture Report",
  other: "Document",
};

const STATUS_CONFIG: Record<ProcessingStatus, { label: string; classes: string }> = {
  complete: { label: "Complete", classes: "bg-green-100 text-green-700" },
  processing: { label: "Processing", classes: "bg-yellow-100 text-yellow-700" },
  pending: { label: "Pending", classes: "bg-cream-200 text-ink-muted" },
  failed: { label: "Failed", classes: "bg-rose-50 text-rose-500" },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface DocumentViewerProps {
  document: Document;
  patientId: string;
  onClose?: () => void;
}

// ── DocumentViewer ───────────────────────────────────────────────────────────

export function DocumentViewer({ document, patientId, onClose }: DocumentViewerProps) {
  const [activeTab, setActiveTab] = useState<"document" | "extracted">("document");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(document.title);
  const [editDate, setEditDate] = useState(document.document_date?.slice(0, 10) ?? "");
  const [editType, setEditType] = useState<DocumentType>(document.type);
  const { onTooltipHide } = useTooltipContext();

  const updateDoc = useUpdateDocument(patientId);
  const deleteDoc = useDeleteDocument(patientId);
  const reprocess = useReprocessDocument(patientId);
  const confirm = useConfirm();

  const isComplete = document.processing_status === "complete";
  const status = STATUS_CONFIG[document.processing_status];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleSave() {
    updateDoc.mutate(
      {
        id: document.id,
        title: editTitle,
        document_date: editDate,
        ...(isComplete ? {} : { type: editType }),
      },
      { onSuccess: () => setEditing(false) }
    );
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${document.title}"?`,
      message: "This removes the file and all extracted data.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) deleteDoc.mutate(document.id, { onSuccess: () => onClose?.() });
  }

  const [downloadError, setDownloadError] = useState(false);

  async function handleDownload() {
    setDownloadError(false);
    try {
      const blob = await api.blob(
        `/patients/${patientId}/documents/${document.id}/file?download=1`
      );
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.title;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setDownloadError(true);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="relative z-10 flex items-center gap-1 px-4 py-3 border-b border-cream-200 bg-white shrink-0 min-w-0">
        <span className="flex-1 min-w-0 text-sm font-semibold text-ink truncate">
          {document.title}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${status.classes}`}>
          {status.label}
        </span>
        <button
          onClick={() => setEditing((s) => !s)}
          onMouseLeave={onTooltipHide}
          aria-label="Edit"
          className="action-icon text-ink-faint hover:text-ink-soft active:text-ink"
        >
          <Pencil size={20} aria-hidden />
          <span className="tooltip">Edit</span>
        </button>
        {document.processing_status === "failed" && (
          <button
            onClick={() => reprocess.mutate(document.id)}
            onMouseLeave={onTooltipHide}
            disabled={reprocess.isPending}
            aria-label="Retry extraction"
            className="action-icon text-teal-500 hover:text-teal-600"
          >
            <RefreshCw size={20} aria-hidden />
            <span className="tooltip">Retry extraction</span>
          </button>
        )}
        <button
          onClick={handleDelete}
          onMouseLeave={onTooltipHide}
          disabled={deleteDoc.isPending}
          aria-label="Delete"
          className="action-icon text-rose-500 hover:text-rose-600 active:text-rose-600"
        >
          <Trash2 size={20} aria-hidden />
          <span className="tooltip">Delete</span>
        </button>
        <button
          onClick={() => void handleDownload()}
          onMouseLeave={onTooltipHide}
          aria-label={downloadError ? "Download failed — try again" : "Download"}
          className={`action-icon ${downloadError ? "text-rose-500 hover:text-rose-600" : "text-ink-faint hover:text-ink-soft"}`}
        >
          <Download size={20} aria-hidden />
          <span className="tooltip">{downloadError ? "Download failed — try again" : "Download"}</span>
        </button>
      </div>

      {/* Inline edit form */}
      {editing && (
        <div className="px-4 py-3 border-b border-cream-200 bg-teal-50 space-y-2 shrink-0">
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full border border-teal-300 rounded px-2 py-1 text-sm"
            placeholder="Title"
          />
          <input
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="border border-teal-300 rounded px-2 py-1 text-sm"
          />
          {!isComplete && (
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as DocumentType)}
              className="w-full border border-teal-300 rounded px-2 py-1 text-sm"
            >
              {(Object.keys(TYPE_LABELS) as DocumentType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          )}
          {isComplete && (
            <p className="text-xs text-ink-faint">
              Type: {TYPE_LABELS[document.type]} (locked after extraction)
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateDoc.isPending}
              className="text-xs text-green-600 hover:underline"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-ink-muted hover:underline">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-cream-200 bg-white shrink-0">
        {(["document", "extracted"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm ${
              activeTab === tab
                ? "border-b-2 border-teal-500 text-teal-500 font-semibold"
                : "text-ink-muted"
            }`}
          >
            {tab === "document" ? "Document" : "Extracted Data"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "document" ? (
          <DocumentTab document={document} patientId={patientId} />
        ) : (
          <ExtractedDataTab document={document} patientId={patientId} onRetry={() => reprocess.mutate(document.id)} />
        )}
      </div>
    </div>
  );
}

// ── Document tab ─────────────────────────────────────────────────────────────

function DocumentTab({ document, patientId }: { document: Document; patientId: string }) {
  const { blobUrl, isLoading, error } = useDocumentFile(patientId, document.id);

  return (
    <div className="flex-1 bg-cream-100 flex items-center justify-center overflow-auto h-full">
      {isLoading && <Spinner />}
      {error && (
        <p className="text-sm text-rose-500">Failed to load document preview.</p>
      )}
      {blobUrl && !isLoading && !error && (
        <>
          {document.mime_type.startsWith("application/pdf") && (
            <embed src={blobUrl} type="application/pdf" className="w-full h-full" title={document.title} />
          )}
          {document.mime_type.startsWith("image/") && document.mime_type !== "image/heic" && (
            <ImageZoomOverlay src={blobUrl} alt={document.title} />
          )}
          {/* Legacy: documents uploaded before HEIC→JPEG conversion was introduced */}
          {document.mime_type === "image/heic" && (
            <p className="text-sm text-ink-muted text-center px-6">
              HEIC preview not available. Use Download to view in your photo app.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Extracted Data tab ───────────────────────────────────────────────────────

interface ExtractedMedSchedule {
  time_of_day?: string;
  meal_relation?: string;
  dose_quantity?: string;
  specific_time?: string;
}

interface ExtractedMed {
  brand_name?: string;
  name?: string;
  generic_name?: string;
  dosage?: string;
  form?: string;
  start_date?: string;
  schedule?: ExtractedMedSchedule[];
  [key: string]: unknown;
}

function ExtractedDataTab({
  document,
  patientId,
  onRetry,
}: {
  document: Document;
  patientId: string;
  onRetry: () => void;
}) {
  const isPrescription = document.type === "prescription";
  const { type, data, isLoading, error, linkedNotes, linkedNotesLoading } = useExtractedData(patientId, document);
  const fullDocQuery = useFullDocument(patientId, document.id, isPrescription);
  const fullDoc = fullDocQuery.data?.document ?? null;

  if (document.processing_status === "pending" || document.processing_status === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-ink-muted">Document is being processed...</p>
      </div>
    );
  }

  if (document.processing_status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-rose-500">Extraction failed.</p>
        <button
          onClick={onRetry}
          className="text-sm text-teal-500 hover:underline"
        >
          ↻ Retry
        </button>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </div>
  );

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-rose-500">Failed to load extracted data.</p>
      </div>
    );
  }

  if (type === "other") {
    if (linkedNotesLoading) return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
    const otherLinkedNotes = (linkedNotes as { notes?: { id: string; visit_date: string; doctor_name: string | null; facility: string | null; diagnosis: string | null; summary: string; treatment_plan: string | null }[] } | null)?.notes ?? [];
    if (otherLinkedNotes.length === 0) {
      return (
        <div className="flex items-center justify-center py-16">
          <p className="text-sm text-ink-muted">No structured data extracted.</p>
        </div>
      );
    }
    return (
      <div className="overflow-auto h-full p-4 space-y-4">
        <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">Linked Notes</p>
        <NotesView data={linkedNotes as NotesData} />
      </div>
    );
  }

  // For prescriptions with a review status, show the review UI only once the full doc has loaded
  const reviewStatus = fullDoc?.medication_review_status;
  if (
    type === "prescription" &&
    fullDocQuery.isSuccess &&
    (reviewStatus === "pending_review" || reviewStatus === "reviewed")
  ) {
    const llmRaw = fullDoc?.llm_raw_response as { medications?: ExtractedMed[] } | null;
    const extractedMedications: ExtractedMed[] = llmRaw?.medications ?? [];
    const decisions: MedicationReviewDecision[] = fullDoc?.medication_review_decisions ?? [];

    return (
      <div className="overflow-auto h-full p-4 space-y-4">
        <PrescriptionReviewView
          patientId={patientId}
          documentId={document.id}
          extractedMedications={extractedMedications}
          decisions={decisions}
          reviewStatus={reviewStatus}
        />
      </div>
    );
  }

  return (
    <div className="overflow-auto h-full p-4 space-y-4">
      {type === "blood_report" && <BloodReportView data={data as BloodReportData} document={document} />}
      {(type === "scan" || type === "ecg") && <ScansView data={data as ScansData} />}
      {type === "prescription" && <MedicationsView data={data as MedicationsData} />}
      {type === "consultation" && <NotesView data={data as NotesData} />}
      {type === "culture_report" && <CultureView data={data as { cultures: CultureResult[] }} document={document} />}
      {((linkedNotes as NotesData | null)?.notes?.length ?? 0) > 0 && (
        <>
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide pt-2">Linked Notes</p>
          <NotesView data={linkedNotes as NotesData} />
        </>
      )}
    </div>
  );
}

// ── Blood Report ─────────────────────────────────────────────────────────────

function BloodReportView({ data, document }: { data: BloodReportData; document: Document }) {
  const results = data?.results ?? [];

  // Group by category
  const grouped = new Map<string, BloodResult[]>();
  for (const r of results) {
    const cat = r.category ?? "other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(r);
  }

  return (
    <>
      {/* Metadata banner */}
      <div className="bg-white rounded-2xl border border-cream-200 p-4 text-sm space-y-1">
        <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
          <span>
            <span className="font-medium text-ink-soft">Type:</span> {TYPE_LABELS[document.type]}
          </span>
          <span>
            <span className="font-medium text-ink-soft">Date:</span>{" "}
            {formatDate(document.document_date)}
          </span>
          {document.source_lab && (
            <span>
              <span className="font-medium text-ink-soft">Lab:</span> {document.source_lab}
            </span>
          )}
          <span>
            <span className="font-medium text-ink-soft">Tests:</span> {results.length}
          </span>
        </div>
      </div>

      {/* Results grouped by category */}
      {Array.from(grouped.entries()).map(([category, rows]) => (
        <div key={category} className="bg-white rounded-2xl border border-cream-200 overflow-hidden">
          <div className="px-4 py-2 bg-cream-50 border-b border-cream-200">
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {category.replace(/_/g, " ")}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-muted">Test</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-muted">Value</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-muted">Ref Range</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-muted">Flag</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-sm text-ink">{r.label}</td>
                  <td className="px-4 py-3 text-sm text-ink-soft">
                    {r.value != null ? r.value : r.value_text ?? "—"}
                    {r.unit && <span className="text-xs text-ink-faint ml-1">{r.unit}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-muted">
                    {r.ref_low_at_test != null && r.ref_high_at_test != null
                      ? `${r.ref_low_at_test} – ${r.ref_high_at_test}`
                      : r.ref_low_at_test != null
                      ? `≥ ${r.ref_low_at_test}`
                      : r.ref_high_at_test != null
                      ? `≤ ${r.ref_high_at_test}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.flag && r.flag !== "NORMAL" ? (
                      <span className="text-xs text-rose-500 font-semibold">{r.flag}</span>
                    ) : r.flag === "NORMAL" ? (
                      <span className="text-xs text-green-600">{r.flag}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ── Scans / ECG ──────────────────────────────────────────────────────────────

function ScansView({ data }: { data: ScansData }) {
  const scans = data?.scans ?? [];

  if (scans.length === 0) {
    return <p className="text-sm text-ink-muted">No findings recorded.</p>;
  }

  return (
    <>
      {scans.map((s) => (
        <div key={s.id} className="bg-white rounded-2xl border border-cream-200 p-4 space-y-2">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">
              {s.scan_type}
            </span>
            <span className="text-xs bg-cream-200 text-ink-soft px-2 py-0.5 rounded-full">
              {s.body_area}
            </span>
          </div>
          <p className="text-sm text-ink-soft">{s.findings_summary}</p>
          {s.impression && (
            <p className="text-sm text-ink-muted italic">{s.impression}</p>
          )}
        </div>
      ))}
    </>
  );
}

// ── Prescription Review ──────────────────────────────────────────────────────

interface PrescriptionReviewViewProps {
  patientId: string;
  documentId: string;
  extractedMedications: ExtractedMed[];
  decisions: MedicationReviewDecision[];
  reviewStatus: "pending_review" | "reviewed";
}

function MedDecisionBadge({ decision }: { decision: "added" | "skipped" }) {
  if (decision === "added") {
    return (
      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
        Added
      </span>
    );
  }
  return (
    <span className="text-xs bg-cream-200 text-ink-muted px-2 py-0.5 rounded-full font-medium">
      Skipped
    </span>
  );
}

function PrescriptionReviewView({
  patientId,
  documentId,
  extractedMedications,
  decisions,
  reviewStatus,
}: PrescriptionReviewViewProps) {
  const [skippingIndex, setSkippingIndex] = useState<number | null>(null);
  const [skipReason, setSkipReason] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  const reviewMutation = useReviewMedication(patientId, documentId);

  const decidedCount = decisions.length;
  const totalCount = extractedMedications.length;

  if (totalCount === 0) {
    return <p className="text-sm text-ink-muted">No medications found in this prescription.</p>;
  }

  return (
    <div className="space-y-4">
      {reviewStatus === "pending_review" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-soft">
            {decidedCount} of {totalCount} reviewed
          </span>
          {decidedCount === totalCount && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
              All reviewed
            </span>
          )}
        </div>
      )}

      {extractedMedications.map((med, i) => {
        const existingDecision = decisions.find((d) => d.extraction_index === i);
        const displayName = med.brand_name ?? med.name ?? "Unknown medication";

        return (
          <div key={i} className="bg-white rounded-2xl border border-cream-200 p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{displayName}</p>
                {med.generic_name && (
                  <p className="text-xs text-ink-muted">{med.generic_name}</p>
                )}
              </div>
              {existingDecision && (
                <MedDecisionBadge decision={existingDecision.decision} />
              )}
            </div>

            {(med.dosage || med.form) && (
              <p className="text-sm text-ink-soft">
                {med.dosage}
                {med.form && <span className="text-xs text-ink-faint ml-1 capitalize">({med.form})</span>}
              </p>
            )}

            {med.schedule && med.schedule.length > 0 && (
              <div className="space-y-1">
                {med.schedule.map((s, si) => (
                  <div key={si} className="text-xs text-ink-soft bg-cream-50 rounded px-2 py-1">
                    {[
                      s.time_of_day ? (s.time_of_day.charAt(0).toUpperCase() + s.time_of_day.slice(1)).replace(/_/g, " ") : null,
                      s.meal_relation && s.meal_relation !== "not_applicable" ? s.meal_relation.replace(/_/g, " ") : null,
                      s.dose_quantity ?? null,
                      s.specific_time ? `at ${s.specific_time}` : null,
                    ].filter(Boolean).join(" · ")}
                  </div>
                ))}
              </div>
            )}

            {existingDecision?.decision === "skipped" && existingDecision.reason && (
              <p className="text-xs text-ink-muted italic">Skipped: {existingDecision.reason}</p>
            )}

            {existingDecision?.decision === "added" && existingDecision.medication_id && (
              <Link to="/medications" className="text-xs text-teal-500 hover:underline">
                View in Medications →
              </Link>
            )}

            {reviewStatus === "pending_review" && !existingDecision && (
              <>
                {skippingIndex === i ? (
                  <div className="space-y-2 pt-1">
                    <input
                      type="text"
                      value={skipReason}
                      onChange={(e) => setSkipReason(e.target.value)}
                      placeholder="Reason for skipping (optional)"
                      className="w-full border border-cream-300 rounded px-2 py-1 text-sm"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          reviewMutation.mutate(
                            { extraction_index: i, decision: "skipped", ...(skipReason ? { reason: skipReason } : {}) },
                            {
                              onSuccess: () => {
                                setSkippingIndex(null);
                                setSkipReason("");
                              },
                            }
                          );
                        }}
                        disabled={reviewMutation.isPending}
                        className="text-xs px-3 py-1.5 bg-cream-200 text-ink-soft rounded hover:bg-cream-300 disabled:opacity-50"
                      >
                        Confirm Skip
                      </button>
                      <button
                        onClick={() => {
                          setSkippingIndex(null);
                          setSkipReason("");
                        }}
                        className="text-xs text-ink-muted hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() =>
                        reviewMutation.mutate({
                          extraction_index: i,
                          decision: "added",
                          medication_data: { ...med, start_date: (med.start_date as string | undefined) ?? today },
                        })
                      }
                      disabled={reviewMutation.isPending}
                      className="text-xs px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setSkippingIndex(i)}
                      disabled={reviewMutation.isPending}
                      className="text-xs px-3 py-1.5 bg-white text-ink-muted border border-cream-300 rounded hover:bg-cream-50 disabled:opacity-50"
                    >
                      Skip
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Prescription ─────────────────────────────────────────────────────────────

function MedicationsView({ data }: { data: MedicationsData }) {
  const medications = data?.medications ?? [];

  if (medications.length === 0) {
    return <p className="text-sm text-ink-muted">No medications recorded.</p>;
  }

  return (
    <>
      {medications.map((m) => (
        <div key={m.id} className="bg-white rounded-2xl border border-cream-200 p-4 space-y-1">
          <p className="text-sm font-bold text-ink">{m.brand_name}</p>
          {m.generic_name && (
            <p className="text-xs text-ink-muted">{m.generic_name}</p>
          )}
          <p className="text-sm text-ink-soft">
            {m.dosage}
            {m.form && <span className="text-xs text-ink-faint ml-1">({m.form})</span>}
          </p>
          {m.schedules && m.schedules.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {m.schedules.map((sch, i) => (
                <li key={i} className="text-xs text-ink-muted">
                  {sch.time_of_day} · {sch.meal_relation.replace(/_/g, " ")} · {sch.dose_quantity}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}

// ── Culture Report ───────────────────────────────────────────────────────────

function CultureView({
  data,
  document,
}: {
  data: { cultures: CultureResult[] };
  document: Document;
}) {
  const cultures = data?.cultures ?? [];

  return (
    <>
      <div className="bg-white rounded-2xl border border-cream-200 p-4 text-sm space-y-1">
        <div className="flex flex-wrap gap-3 text-xs text-ink-muted">
          <span>
            <span className="font-medium text-ink-soft">Type:</span> {TYPE_LABELS[document.type]}
          </span>
          <span>
            <span className="font-medium text-ink-soft">Date:</span>{" "}
            {formatDate(document.document_date)}
          </span>
          <span>
            <span className="font-medium text-ink-soft">Results:</span> {cultures.length}
          </span>
        </div>
      </div>

      {cultures.length === 0 ? (
        <p className="text-sm text-ink-muted">No culture results extracted.</p>
      ) : (
        cultures.map((c) => {
          const badge = CULTURE_STATUS_BADGE[c.result_status] ?? CULTURE_STATUS_BADGE.positive;
          return (
            <div key={c.id} className="bg-white rounded-2xl border border-cream-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {CULTURE_SPECIMEN_LABELS[c.specimen_type] ?? "Culture"}
                  </p>
                  {c.collection_date && (
                    <p className="text-xs text-ink-faint mt-0.5">{formatDate(c.collection_date)}</p>
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.classes}`}>
                  {badge.label}
                </span>
              </div>

              {c.organism && (
                <div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">
                    Organism
                  </p>
                  <p className="text-sm text-ink italic">
                    {c.organism}
                    {c.growth_quantity && (
                      <span className="not-italic text-xs text-ink-faint ml-2">
                        ({c.growth_quantity} growth)
                      </span>
                    )}
                  </p>
                </div>
              )}

              <SensitivityGrid sensitivities={c.sensitivities} />

              {c.comments && (
                <blockquote className="border-l-2 border-teal-500 pl-3">
                  <p className="text-xs text-ink-soft leading-relaxed">{c.comments}</p>
                </blockquote>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

// ── Consultation ─────────────────────────────────────────────────────────────

function NotesView({ data }: { data: NotesData }) {
  const notes = data?.notes ?? [];

  if (notes.length === 0) {
    return <p className="text-sm text-ink-muted">No consultation notes recorded.</p>;
  }

  return (
    <>
      {notes.map((n) => (
        <div key={n.id} className="bg-white rounded-2xl border border-cream-200 p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {n.diagnosis && (
                <p className="text-sm font-bold text-ink">{n.diagnosis}</p>
              )}
            </div>
            <Link
              to={`/notes?focus=${n.id}`}
              className="text-xs text-teal-500 hover:underline flex-shrink-0"
            >
              Open in Notes →
            </Link>
          </div>
          <p className="text-sm text-ink-soft">{n.summary}</p>
          {n.treatment_plan && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-green-700 mb-1">Treatment Plan</p>
              <p className="text-sm text-green-900">{n.treatment_plan}</p>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
