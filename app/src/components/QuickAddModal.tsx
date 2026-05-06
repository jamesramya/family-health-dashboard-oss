import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, Check } from "lucide-react";
import { useSelectedPatient } from "@/contexts/selected-patient";
import { useConfirm } from "@/hooks/use-confirm";
import { VitalLogPanel } from "@/components/VitalLogPanel";
import { MedicationForm } from "@/components/MedicationForm";
import { NoteFormPanel } from "@/components/NoteFormPanel";
import { DocumentUpload } from "@/components/DocumentUpload";
import { LabUploadPanel } from "@/components/quick-add/LabUploadPanel";
import { ScanComingSoon } from "@/components/quick-add/ScanComingSoon";

export type QuickAddKind = "vital" | "medication" | "note" | "document" | "lab" | "scan";

interface KindMeta {
  title: string;
  entityLabel: string;
  viewLabel: string;
  viewTo: string;
}

const META: Record<QuickAddKind, KindMeta> = {
  vital: { title: "Log Vital", entityLabel: "Vital", viewLabel: "View in Vitals", viewTo: "/vitals" },
  medication: { title: "Add Medication", entityLabel: "Medication", viewLabel: "View in Medications", viewTo: "/medications" },
  note: { title: "Add Note", entityLabel: "Note", viewLabel: "View in Notes", viewTo: "/notes" },
  document: { title: "Upload Documents", entityLabel: "Document", viewLabel: "View in Documents", viewTo: "/documents" },
  lab: { title: "Upload Lab", entityLabel: "Lab Report", viewLabel: "View in Documents", viewTo: "/documents" },
  scan: { title: "Add Scan", entityLabel: "Scan", viewLabel: "View in Scans", viewTo: "/scans" },
};

export function QuickAddModal({
  kind,
  onClose,
}: {
  kind: QuickAddKind | null;
  onClose: () => void;
}): JSX.Element | null {
  const { patientId } = useSelectedPatient();
  const confirm = useConfirm();
  const [succeeded, setSucceeded] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const dirtyRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const isOpen = kind !== null;
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"open" | "closed">("closed");

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => setState("open"));
    } else {
      setState("closed");
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (kind === null) {
      setSucceeded(false);
      setFormKey(0);
      dirtyRef.current = false;
    }
  }, [kind]);

  function isSubmittingInFlight(): boolean {
    const root = bodyRef.current;
    if (!root) return false;
    const buttons = root.querySelectorAll<HTMLButtonElement>("button[disabled]");
    for (const b of buttons) {
      const t = (b.textContent ?? "").trim().toLowerCase();
      if (t.startsWith("saving") || t.startsWith("uploading")) return true;
    }
    return false;
  }

  async function attemptClose() {
    if (isSubmittingInFlight()) return;
    if (!succeeded && dirtyRef.current) {
      const ok = await confirm({
        title: "Discard unsaved changes?",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        destructive: true,
      });
      if (!ok) return;
    }
    onClose();
  }

  useEffect(() => {
    if (kind === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        attemptClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, succeeded]);

  if (!visible) return null;

  const meta = kind ? META[kind] : META.vital;

  function handleFormSuccess() {
    dirtyRef.current = false;
    if (kind === "document" || kind === "lab") {
      onClose();
      return;
    }
    setSucceeded(true);
  }

  function handleAddAnother() {
    dirtyRef.current = false;
    setSucceeded(false);
    setFormKey((k) => k + 1);
  }

  function renderForm(): JSX.Element {
    if (!patientId) {
      return (
        <p className="text-sm text-ink-muted py-8 text-center">
          No patient found. Please complete setup first.
        </p>
      );
    }
    if (kind === "vital") {
      return <VitalLogPanel key={formKey} patientId={patientId} onSuccess={handleFormSuccess} />;
    }
    if (kind === "medication") {
      return (
        <MedicationForm
          key={formKey}
          patientId={patientId}
          onSuccess={handleFormSuccess}
          onCancel={attemptClose}
        />
      );
    }
    if (kind === "note") {
      return (
        <NoteFormPanel
          key={formKey}
          patientId={patientId}
          onSuccess={handleFormSuccess}
          onCancel={attemptClose}
        />
      );
    }
    if (kind === "lab") {
      return <LabUploadPanel key={formKey} patientId={patientId} onSuccess={handleFormSuccess} />;
    }
    if (kind === "scan") {
      return <ScanComingSoon onSwitchToDocument={() => onClose()} />;
    }
    return <DocumentUpload key={formKey} patientId={patientId} onSuccess={handleFormSuccess} />;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
    >
      <div
        data-quickadd-backdrop
        data-state={state}
        className="absolute inset-0 bg-black/40"
        onClick={attemptClose}
        aria-hidden
      />
      <div
        data-quickadd-panel
        data-state={state}
        className="relative bg-white w-full md:max-w-2xl md:w-full md:rounded-xl rounded-t-xl shadow-xl max-h-[95vh] md:max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-cream-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-ink">{meta.title}</h2>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center text-ink-muted hover:text-ink rounded"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div
          ref={bodyRef}
          onInputCapture={() => {
            dirtyRef.current = true;
          }}
          className="px-5 py-5 overflow-y-auto flex-1"
        >
          {succeeded ? (
            <div className="py-6 text-center space-y-5">
              <div className="flex items-center justify-center gap-2">
                <Check size={22} className="text-sage-600" aria-hidden />
                <p className="text-base font-semibold text-ink">
                  {meta.entityLabel} saved
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-center gap-2">
                <Link
                  to={meta.viewTo}
                  onClick={onClose}
                  className="px-4 py-2 bg-teal-600 text-cream-50 text-sm font-medium rounded-full hover:bg-teal-700 text-center"
                >
                  {meta.viewLabel}
                </Link>
                <button
                  type="button"
                  onClick={handleAddAnother}
                  className="px-4 py-2 bg-white border border-cream-300 text-ink text-sm font-medium rounded-full hover:bg-cream-100"
                >
                  Add another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white border border-cream-300 text-ink text-sm font-medium rounded-full hover:bg-cream-100"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            renderForm()
          )}
        </div>
      </div>
    </div>
  );
}
