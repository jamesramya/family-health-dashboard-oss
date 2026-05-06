import { useState } from "react";
import { X } from "lucide-react";
import {
  useUpdateMedication,
  useDeleteMedication,
  useDiscontinueMedication,
  useRestartMedication,
} from "@/hooks/use-medications";
import { useConfirm } from "@/hooks/use-confirm";
import { formatMedName } from "@/lib/medNames";
import type { Medication, MedicationSchedule } from "@/types/api";

interface MedicationEditRowProps {
  medication: Medication & { schedules: MedicationSchedule[] };
  patientId: string;
  onDone: () => void;
  onOpenFullEditor?: () => void;
}

export function MedicationEditRow({
  medication,
  patientId,
  onDone,
  onOpenFullEditor,
}: MedicationEditRowProps) {
  const [dosage, setDosage] = useState(medication.dosage ?? "");
  const [reason, setReason] = useState(medication.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const updateMed = useUpdateMedication(patientId, medication.id);
  const deleteMed = useDeleteMedication(patientId);
  const discontinueMed = useDiscontinueMedication(patientId);
  const restartMed = useRestartMedication(patientId);
  const confirm = useConfirm();

  const isActive = !!medication.is_active;
  const anyPending =
    updateMed.isPending ||
    deleteMed.isPending ||
    discontinueMed.isPending ||
    restartMed.isPending;

  async function handleSave() {
    setError(null);
    try {
      await updateMed.mutateAsync({ dosage: dosage || undefined, reason: reason || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this medication?",
      message: "This permanently removes the medication and all its history.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteMed.mutateAsync(medication.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleDiscontinue() {
    const ok = await confirm({
      title: "Stop taking this medication?",
      message: "It will move to Past. You can restart it later.",
      confirmLabel: "Stop",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await discontinueMed.mutateAsync({ id: medication.id });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to discontinue");
    }
  }

  async function handleRestart() {
    setError(null);
    try {
      await restartMed.mutateAsync({ id: medication.id });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restart");
    }
  }

  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
          {formatMedName(medication.brand_name, medication.generic_name)}
        </span>
        <button onClick={onDone} className="text-ink-faint hover:text-ink-muted" aria-label="Close">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Dosage</label>
          <input
            type="text"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="e.g. 75 mcg"
            className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Hypothyroidism"
            className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
      </div>

      {onOpenFullEditor && (
        <button
          type="button"
          onClick={onOpenFullEditor}
          className="text-xs text-teal-600 hover:text-teal-700 underline"
        >
          Edit schedules &amp; full details →
        </button>
      )}

      {error && <p className="text-sm text-rose-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleDelete()}
          disabled={anyPending}
          aria-label="Delete medication"
          className="text-sm text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
        >
          {deleteMed.isPending ? "Deleting…" : "Delete"}
        </button>

        {isActive ? (
          <button
            onClick={() => void handleDiscontinue()}
            disabled={anyPending}
            className="text-sm text-amber-600 hover:text-amber-700 px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
          >
            {discontinueMed.isPending ? "Stopping…" : "Discontinue"}
          </button>
        ) : (
          <button
            onClick={() => void handleRestart()}
            disabled={anyPending}
            className="text-sm text-teal-600 hover:text-teal-700 px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
          >
            {restartMed.isPending ? "Restarting…" : "Restart"}
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={onDone}
          className="text-sm text-ink-muted hover:text-ink-soft px-3 py-1.5 border border-cream-200 rounded-xl"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={anyPending}
          className="text-sm bg-teal-500 text-white px-3 py-1.5 rounded-xl hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          {updateMed.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
