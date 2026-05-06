import { useState } from "react";
import { X } from "lucide-react";
import { useUpdateVital, useDeleteVital } from "@/hooks/use-vitals";
import { useConfirm } from "@/hooks/use-confirm";
import { VITAL_OPTIONS, toLocalDatetimeInput } from "@/components/VitalLogPanel";
import type { VitalReading } from "@/types/api";

interface VitalEditRowProps {
  reading: VitalReading;
  patientId: string;
  onDone: () => void;
}

export function VitalEditRow({ reading, patientId, onDone }: VitalEditRowProps) {
  const opt = VITAL_OPTIONS.find((o) => o.value === reading.type)!;
  const [valuePrimary, setValuePrimary] = useState(String(reading.value_primary));
  const [valueSecondary, setValueSecondary] = useState(
    reading.value_secondary != null ? String(reading.value_secondary) : ""
  );
  const [measuredAt, setMeasuredAt] = useState(toLocalDatetimeInput(reading.measured_at));
  const [unit, setUnit] = useState(reading.unit);
  const [context, setContext] = useState(reading.context ?? "");
  const [error, setError] = useState<string | null>(null);
  const updateVital = useUpdateVital(patientId);
  const deleteVital = useDeleteVital(patientId);
  const confirm = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this reading?",
      message: "This removes the reading from charts and history.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await deleteVital.mutateAsync(reading.id);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function handleSave() {
    setError(null);
    try {
      await updateVital.mutateAsync({
        vitalId: reading.id,
        data: {
          measured_at: new Date(measuredAt).toISOString(),
          value_primary: Number(valuePrimary),
          value_secondary: valueSecondary ? Number(valueSecondary) : null,
          unit,
          context: context || null,
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="bg-teal-50 border border-teal-100 rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-teal-600 uppercase tracking-wide">
          {opt.label}
        </span>
        <button onClick={onDone} className="text-ink-faint hover:text-ink-muted" aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className="block text-xs text-ink-muted mb-1">Date &amp; Time</label>
          <input
            type="datetime-local"
            value={measuredAt}
            onChange={(e) => setMeasuredAt(e.target.value)}
            className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">
            {reading.type === "bp" ? `Systolic (${unit})` : `Value (${unit})`}
          </label>
          <input
            type="number"
            inputMode="decimal"
            pattern="[0-9]*"
            step="0.01"
            min="0"
            value={valuePrimary}
            onChange={(e) => setValuePrimary(e.target.value)}
            className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
        {opt.hasSecondary ? (
          <div>
            <label className="block text-xs text-ink-muted mb-1">
              {opt.secondaryLabel} ({unit})
            </label>
            <input
              type="number"
              inputMode="decimal"
              pattern="[0-9]*"
              step="0.01"
              min="0"
              value={valueSecondary}
              onChange={(e) => setValueSecondary(e.target.value)}
              className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-ink-muted mb-1">Unit</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              disabled={opt.units.length === 1}
              className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong disabled:bg-cream-200"
            >
              {opt.units.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs text-ink-muted mb-1">Context (optional)</label>
        <input
          type="text"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. Fasting"
          className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
        />
      </div>
      {error && <p className="text-sm text-rose-500">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void handleDelete()}
          disabled={deleteVital.isPending || updateVital.isPending}
          aria-label="Delete reading"
          className="text-sm text-rose-500 hover:text-rose-600 px-3 py-1.5 rounded-xl disabled:opacity-50 transition-colors"
        >
          {deleteVital.isPending ? "Deleting…" : "Delete"}
        </button>
        <div className="flex-1" />
        <button
          onClick={onDone}
          className="text-sm text-ink-muted hover:text-ink-soft px-3 py-1.5 border border-cream-200 rounded-xl"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleSave()}
          disabled={updateVital.isPending}
          className="text-sm bg-teal-500 text-white px-3 py-1.5 rounded-xl hover:bg-teal-600 disabled:opacity-50 transition-colors"
        >
          {updateVital.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
