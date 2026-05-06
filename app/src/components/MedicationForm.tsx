import { useState } from "react";
import { useCreateMedication, useUpdateMedication } from "@/hooks/use-medications";
import { Btn } from "@/components/ui/Btn";
import type { Medication, MedicationSchedule, MedicationForm as MedForm } from "@/types/api";
import { normalizeDays, splitForOtherDays, type DayKey } from "@/lib/medSchedule";

// Short day keys in display order — used internally and sent to the backend
const DAY_KEYS: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABELS = ["M","T","W","T","F","S","S"];

// Full-name → short-key map for converting legacy DB values
const FULL_TO_SHORT: Record<string, DayKey> = {
  monday:"mon", tuesday:"tue", wednesday:"wed", thursday:"thu",
  friday:"fri", saturday:"sat", sunday:"sun",
};

function toShortDays(raw: string | null): string {
  if (!raw) return "all";
  if (raw === "all") return "all";
  const parts = raw.split(",").map((p) => FULL_TO_SHORT[p] ?? p);
  return parts.join(",");
}

// A single schedule row's local state
interface ScheduleRowState {
  id?: string;            // present only when editing an existing DB row
  days_of_week: string;  // comma-separated day names
  time_of_day: string;
  specific_time: string;
  meal_relation: string;
  dose_quantity: string;
  instructions: string;
}

// One medication card's local state
interface MedCardState {
  brand_name: string;
  generic_name: string;
  dosage: string;
  form: string;
  start_date: string;
  reason: string;
  notes: string;
  is_active: boolean;
  schedules: ScheduleRowState[];
  error?: string;
}

function emptyScheduleRow(): ScheduleRowState {
  return {
    days_of_week: "all",
    time_of_day: "morning",
    specific_time: "",
    meal_relation: "after_meal",
    dose_quantity: "",
    instructions: "",
  };
}

function emptyMedCard(): MedCardState {
  return {
    brand_name: "", generic_name: "", dosage: "", form: "",
    start_date: "", reason: "", notes: "", is_active: true,
    schedules: [emptyScheduleRow()],
  };
}

// Converts an existing Medication + its schedules into editable card state
function medCardFromExisting(
  med: Medication,
  schedules: MedicationSchedule[]
): MedCardState {
  return {
    brand_name: med.brand_name,
    generic_name: med.generic_name ?? "",
    dosage: med.dosage ?? "",
    form: med.form ?? "",
    start_date: med.start_date ?? "",
    reason: med.reason ?? "",
    notes: med.notes ?? "",
    is_active: !!med.is_active,
    schedules: schedules.length > 0
      ? schedules.map((s) => ({
          id: s.id,
          days_of_week: toShortDays(s.days_of_week),
          time_of_day: s.time_of_day,
          specific_time: s.specific_time ?? "",
          meal_relation: s.meal_relation,
          dose_quantity: s.dose_quantity ?? "",
          instructions: s.instructions ?? "",
        }))
      : [emptyScheduleRow()],
  };
}

const TIME_OPTIONS = ["morning","afternoon","evening","night","bedtime","as_needed"] as const;
const TIME_LABELS: Record<string, string> = {
  morning:"Morning", afternoon:"Afternoon", evening:"Evening",
  night:"Night", bedtime:"Bedtime", as_needed:"As needed",
};
const MEAL_OPTIONS = [
  { value:"after_meal", label:"After meal" },
  { value:"before_meal", label:"Before meal" },
  { value:"with_meal", label:"With meal" },
  { value:"empty_stomach", label:"Empty stomach" },
  { value:"not_applicable", label:"N/A" },
];

function ScheduleRow({
  row, onChange, onRemove, onSplitOtherDays,
}: {
  row: ScheduleRowState;
  onChange: (updated: ScheduleRowState) => void;
  onRemove: () => void;
  onSplitOtherDays: (kept: string, other: string) => void;
}) {
  const effectiveDays = row.days_of_week === "all" ? DAY_KEYS.join(",") : (row.days_of_week ?? "");
  const activeDays = new Set(effectiveDays ? effectiveDays.split(",") : []);

  function toggleDay(key: DayKey) {
    const next = new Set(activeDays);
    if (next.has(key)) next.delete(key); else next.add(key);
    const selected = DAY_KEYS.filter((d) => next.has(d));
    onChange({ ...row, days_of_week: normalizeDays(selected) });
  }

  function handleSplit() {
    const { kept, other } = splitForOtherDays(row.days_of_week || "all");
    onChange({ ...row, days_of_week: kept });
    onSplitOtherDays(kept, other);
  }

  return (
    <div className="bg-cream-50 border border-cream-300 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-1">
          {DAY_KEYS.map((key, i) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleDay(key)}
              className={`w-7 h-7 rounded-full border text-xs font-semibold transition-colors ${
                activeDays.has(key)
                  ? "bg-teal-500 border-teal-500 text-cream-50"
                  : "border-cream-300 text-ink-faint hover:border-teal-300"
              }`}
            >
              {DAY_LABELS[i]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSplit}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            + Other days
          </button>
          <button type="button" onClick={onRemove} className="text-xs text-rose-500 hover:text-rose-600">✕</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label className="block text-xs text-ink-muted mb-1">Time</label>
          <select
            value={row.time_of_day}
            onChange={(e) => onChange({ ...row, time_of_day: e.target.value })}
            className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          >
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{TIME_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">At (HH:MM)</label>
          <input
            type="time"
            value={row.specific_time}
            onChange={(e) => onChange({ ...row, specific_time: e.target.value })}
            className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Meal</label>
          <select
            value={row.meal_relation}
            onChange={(e) => onChange({ ...row, meal_relation: e.target.value })}
            className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          >
            {MEAL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Dose</label>
          <input
            type="text"
            inputMode="decimal"
            value={row.dose_quantity}
            onChange={(e) => onChange({ ...row, dose_quantity: e.target.value })}
            placeholder="e.g. 1 tablet"
            className="w-full border border-cream-300 rounded-lg px-2 py-1.5 text-base focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
          />
        </div>
      </div>
    </div>
  );
}

const FORM_OPTIONS: { value: MedForm; label: string }[] = [
  { value:"tablet", label:"Tablet" }, { value:"capsule", label:"Capsule" },
  { value:"syrup", label:"Syrup" }, { value:"injection", label:"Injection" },
  { value:"cream", label:"Cream" }, { value:"drops", label:"Drops" },
  { value:"inhaler", label:"Inhaler" }, { value:"other", label:"Other" },
];

function MedCard({
  card, index, onChange, onRemove,
}: {
  card: MedCardState;
  index: number;
  onChange: (updated: MedCardState) => void;
  onRemove?: () => void;
}) {
  const inputCls = "w-full border border-cream-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong";

  function updateScheduleRow(i: number, updated: ScheduleRowState) {
    const next = [...card.schedules];
    next[i] = updated;
    onChange({ ...card, schedules: next });
  }

  return (
    <div className="bg-cream-50 border border-cream-200 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink-muted">Medication {index + 1}</span>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-rose-500 hover:text-rose-600">
            ✕ Remove
          </button>
        )}
      </div>

      {card.error && <p className="text-xs text-red-600 mb-2">{card.error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div className="sm:col-span-2">
          <label className="block text-xs text-ink-muted mb-1">Brand name <span className="text-red-500">*</span></label>
          <input type="text" value={card.brand_name}
            onChange={(e) => onChange({ ...card, brand_name: e.target.value })}
            placeholder="e.g. Metformin" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Generic name</label>
          <input type="text" value={card.generic_name}
            onChange={(e) => onChange({ ...card, generic_name: e.target.value })}
            className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Dosage</label>
          <input type="text" value={card.dosage}
            onChange={(e) => onChange({ ...card, dosage: e.target.value })}
            placeholder="e.g. 500mg" className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Form</label>
          <select value={card.form}
            onChange={(e) => onChange({ ...card, form: e.target.value })}
            className={inputCls}>
            <option value="">Select form...</option>
            {FORM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">Start date</label>
          <input type="date" value={card.start_date}
            onChange={(e) => onChange({ ...card, start_date: e.target.value })}
            className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-ink-muted mb-1">Reason / indication</label>
          <input type="text" value={card.reason}
            onChange={(e) => onChange({ ...card, reason: e.target.value })}
            placeholder="e.g. Type 2 diabetes" className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer">
            <input type="checkbox" checked={card.is_active}
              onChange={(e) => onChange({ ...card, is_active: e.target.checked })}
              className="rounded border-cream-300 text-teal-600" />
            Active medication
          </label>
        </div>
      </div>

      {/* Schedule rows */}
      <div className="border-t border-cream-100 pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-ink-faint uppercase tracking-wide">Schedule</span>
          <button type="button"
            onClick={() => onChange({ ...card, schedules: [...card.schedules, emptyScheduleRow()] })}
            className="text-xs text-teal-600 hover:underline font-medium">
            ＋ Add row
          </button>
        </div>
        <div className="space-y-2">
          {card.schedules.map((row, i) => (
            <ScheduleRow key={i} row={row}
              onChange={(updated) => updateScheduleRow(i, updated)}
              onRemove={() => onChange({ ...card, schedules: card.schedules.filter((_, idx) => idx !== i) })}
              onSplitOtherDays={(_kept, other) => {
                const newRow: ScheduleRowState = { ...emptyScheduleRow(), time_of_day: row.time_of_day, days_of_week: other };
                const next = [...card.schedules];
                next.splice(i + 1, 0, newRow);
                onChange({ ...card, schedules: next });
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface MedicationFormProps {
  patientId: string;
  existing?: Medication;
  initialSchedules?: MedicationSchedule[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function MedicationForm({
  patientId, existing, initialSchedules = [], onSuccess, onCancel,
}: MedicationFormProps) {
  const createMed = useCreateMedication(patientId);
  const updateMed = useUpdateMedication(patientId, existing?.id ?? "");

  const [cards, setCards] = useState<MedCardState[]>(() =>
    existing
      ? [medCardFromExisting(existing, initialSchedules)]
      : [emptyMedCard()]
  );
  const [isSaving, setIsSaving] = useState(false);
  const isEdit = !!existing;

  function buildPayload(card: MedCardState) {
    return {
      brand_name: card.brand_name,
      generic_name: card.generic_name || undefined,
      dosage: card.dosage || undefined,
      form: (card.form || undefined) as MedForm | undefined,
      start_date: card.start_date || undefined,
      reason: card.reason || undefined,
      notes: card.notes || undefined,
      is_active: card.is_active ? 1 : 0,
      schedules: card.schedules.map((s) => {
        const selectedDays = s.days_of_week === "all" || !s.days_of_week
          ? DAY_KEYS
          : (s.days_of_week.split(",") as DayKey[]);
        return {
          ...(s.id ? { id: s.id } : {}),
          time_of_day: s.time_of_day,
          meal_relation: s.meal_relation,
          dose_quantity: s.dose_quantity || null,
          specific_time: s.specific_time || undefined,
          instructions: s.instructions || undefined,
          days_of_week: normalizeDays(selectedDays),
        };
      }),
    };
  }

  async function handleSave() {
    const invalidIdx = cards.findIndex((c) => !c.brand_name.trim());
    if (invalidIdx !== -1) {
      setCards((prev) =>
        prev.map((c, i) => i === invalidIdx ? { ...c, error: "Brand name is required" } : c)
      );
      return;
    }

    setIsSaving(true);

    if (isEdit) {
      try {
        await updateMed.mutateAsync(buildPayload(cards[0]));
        onSuccess?.();
      } catch (e) {
        setCards((prev) => [{ ...prev[0], error: e instanceof Error ? e.message : "Failed to save" }]);
      }
    } else {
      // Batch: fire one POST per card, keep failed cards with error message
      const results = await Promise.allSettled(
        cards.map((card) => createMed.mutateAsync(buildPayload(card)))
      );
      const failedCards: MedCardState[] = [];
      results.forEach((result, i) => {
        if (result.status === "rejected") {
          const msg = result.reason instanceof Error ? result.reason.message : "Failed to save";
          failedCards.push({ ...cards[i], error: msg });
        }
      });
      if (failedCards.length === 0) {
        onSuccess?.();
      } else {
        setCards(failedCards);
      }
    }

    setIsSaving(false);
  }

  const saveLabel = isSaving ? "Saving..."
    : isEdit ? "Update Medication"
    : `Save ${cards.length} medication${cards.length !== 1 ? "s" : ""}`;

  return (
    <div className="space-y-4">
      {cards.map((card, i) => (
        <MedCard
          key={i}
          card={card}
          index={i}
          onChange={(updated) => setCards((prev) => prev.map((c, idx) => idx === i ? updated : c))}
          onRemove={cards.length > 1 ? () => setCards((prev) => prev.filter((_, idx) => idx !== i)) : undefined}
        />
      ))}

      {!isEdit && (
        <button type="button"
          onClick={() => setCards((prev) => [...prev, emptyMedCard()])}
          className="px-4 py-2 bg-white border border-cream-300 text-ink-soft text-sm font-medium rounded-lg hover:bg-cream-50 transition-colors">
          ＋ Add another medication
        </button>
      )}

      <div className="flex gap-2">
        <Btn variant="primary" onClick={() => void handleSave()} disabled={isSaving}>
          {saveLabel}
        </Btn>
        {onCancel && (
          <Btn variant="secondary" onClick={onCancel}>
            Cancel
          </Btn>
        )}
      </div>
    </div>
  );
}
