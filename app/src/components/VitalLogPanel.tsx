import { useState } from "react";
import { useCreateVital } from "@/hooks/use-vitals";
import { api } from "@/lib/api";
import { Btn } from "@/components/ui/Btn";
import type { VitalType } from "@/types/api";

interface ParsedVital {
  type?: VitalType;
  measured_at?: string;
  measured_date?: string;
  value_primary?: number | string | null;
  value_secondary?: number | string | null;
  unit?: string | null;
  context?: string | null;
}

export const VITAL_OPTIONS: Array<{
  value: VitalType;
  label: string;
  units: string[];
  hasSecondary?: boolean;
  secondaryLabel?: string;
}> = [
  { value: "bp", label: "Blood Pressure", units: ["mmHg"], hasSecondary: true, secondaryLabel: "Diastolic" },
  { value: "heart_rate", label: "Heart Rate", units: ["bpm"] },
  { value: "temperature", label: "Temperature", units: ["°C", "°F"] },
  { value: "weight", label: "Weight", units: ["kg", "lbs"] },
  { value: "spo2", label: "SpO₂", units: ["%"] },
  { value: "glucose", label: "Blood Glucose", units: ["mg/dL", "mmol/L"] },
];

function defaultUnitFor(type: VitalType): string {
  return VITAL_OPTIONS.find((o) => o.value === type)!.units[0];
}

interface VitalCard {
  id: string;
  type: VitalType;
  measured_at: string;
  value_primary: string;
  value_secondary: string;
  unit: string;
  context: string;
}

// datetime-local inputs work in local time; these helpers convert safely.
export function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function localDatetimeNow(): string {
  return toLocalDatetimeInput(new Date().toISOString());
}

function newCard(overrides: Partial<VitalCard> = {}): VitalCard {
  const type = overrides.type ?? "bp";
  return {
    id: crypto.randomUUID(),
    type,
    measured_at: localDatetimeNow(),
    value_primary: "",
    value_secondary: "",
    unit: defaultUnitFor(type),
    context: "",
    ...overrides,
  };
}

interface VitalLogPanelProps {
  patientId: string;
  onSuccess?: () => void;
}

export function VitalLogPanel({ patientId, onSuccess }: VitalLogPanelProps) {
  const [nlpText, setNlpText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [cards, setCards] = useState<VitalCard[]>([newCard()]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const createVital = useCreateVital(patientId);

  async function handleParse() {
    if (!nlpText.trim()) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const result = await api.post<{ vitals: ParsedVital[] }>(
        `/patients/${patientId}/vitals/parse`,
        {
          text: nlpText,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          localDate: new Date().toLocaleDateString("sv"),
        }
      );
      const parsed = result.vitals ?? [];
      if (parsed.length === 0) {
        setParseError("No vitals found. Try being more specific.");
        return;
      }
      setCards(parsed.map((v) => {
        const type: VitalType = v.type ?? "bp";
        const opt = VITAL_OPTIONS.find((o) => o.value === type)!;
        const parsedUnit = typeof v.unit === "string" ? v.unit : null;
        const unit = parsedUnit && opt.units.includes(parsedUnit) ? parsedUnit : opt.units[0];
        let measured_at: string;
        if (v.measured_at) {
          measured_at = toLocalDatetimeInput(v.measured_at);
        } else if (v.measured_date) {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, "0");
          const mm = String(now.getMinutes()).padStart(2, "0");
          measured_at = `${v.measured_date}T${hh}:${mm}`;
        } else {
          measured_at = localDatetimeNow();
        }
        return newCard({
          type,
          measured_at,
          value_primary: v.value_primary != null ? String(v.value_primary) : "",
          value_secondary: v.value_secondary != null ? String(v.value_secondary) : "",
          unit,
          context: v.context ?? "",
        });
      }));
      setNlpText("");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setIsParsing(false);
    }
  }

  function updateCard(id: string, field: keyof VitalCard, value: string) {
    setCards((prev) => prev.map((c) => {
      if (c.id !== id) return c;
      if (field === "type") {
        const newType = value as VitalType;
        return { ...c, type: newType, unit: defaultUnitFor(newType), value_secondary: "" };
      }
      return { ...c, [field]: value };
    }));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  async function handleSaveAll() {
    const valid = cards.filter((c) => c.value_primary !== "");
    if (valid.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await Promise.all(valid.map((c) => createVital.mutateAsync({
        type: c.type,
        measured_at: new Date(c.measured_at).toISOString(),
        value_primary: Number(c.value_primary),
        value_secondary: c.value_secondary ? Number(c.value_secondary) : undefined,
        unit: c.unit,
        context: c.context || undefined,
        source: "manual",
      })));
      setCards([newCard()]);
      onSuccess?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  const filledCount = cards.filter((c) => c.value_primary !== "").length;

  return (
    <div className="space-y-4">
      {/* NLP bar */}
      <div className="space-y-2">
        <p className="text-sm text-ink-muted">
          Describe readings in plain English, e.g. "BP 144/81, pulse 84, CBG 124"
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={nlpText}
            onChange={(e) => setNlpText(e.target.value)}
            rows={2}
            placeholder="e.g. BP 120/80, heart rate 72 bpm, taken this morning"
            className="flex-1 border border-cream-300 rounded-xl px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong resize-none"
          />
          <Btn
            onClick={handleParse}
            disabled={isParsing || !nlpText.trim()}
            className="sm:self-end"
          >
            {isParsing ? "Parsing…" : "Parse"}
          </Btn>
        </div>
        {parseError && <p className="text-sm text-rose-500">{parseError}</p>}
      </div>

      <div className="border-t border-cream-200 pt-4 space-y-3">
        {cards.map((card) => {
          const opt = VITAL_OPTIONS.find((o) => o.value === card.type)!;
          return (
            <div key={card.id} className="border border-cream-200 rounded-xl p-3 space-y-3 bg-cream-50">
              <div className="flex items-center justify-between">
                <select
                  value={card.type}
                  onChange={(e) => updateCard(card.id, "type", e.target.value)}
                  className="border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                >
                  {VITAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {cards.length > 1 && (
                  <button onClick={() => removeCard(card.id)} className="text-xs text-ink-faint hover:text-rose-500">
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-ink-muted mb-1">Date & Time</label>
                  <input
                    type="datetime-local"
                    value={card.measured_at}
                    onChange={(e) => updateCard(card.id, "measured_at", e.target.value)}
                    className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">
                    {card.type === "bp" ? `Systolic (${card.unit})` : `Value (${card.unit})`}
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={card.value_primary}
                    onChange={(e) => updateCard(card.id, "value_primary", e.target.value)}
                    placeholder="0"
                    className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                  />
                </div>
                {opt.hasSecondary ? (
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">
                      {opt.secondaryLabel} ({card.unit})
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={card.value_secondary}
                      onChange={(e) => updateCard(card.id, "value_secondary", e.target.value)}
                      placeholder="0"
                      className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">Unit</label>
                    <select
                      value={card.unit}
                      onChange={(e) => updateCard(card.id, "unit", e.target.value)}
                      disabled={opt.units.length === 1}
                      className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong disabled:bg-cream-200 disabled:text-ink-muted"
                    >
                      {opt.units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {opt.hasSecondary && (
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">Unit</label>
                    <select
                      value={card.unit}
                      onChange={(e) => updateCard(card.id, "unit", e.target.value)}
                      disabled={opt.units.length === 1}
                      className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong disabled:bg-cream-200 disabled:text-ink-muted"
                    >
                      {opt.units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={opt.hasSecondary ? "col-span-3" : "col-span-2 sm:col-span-4"}>
                  <label className="block text-xs text-ink-muted mb-1">Context (optional)</label>
                  <input
                    type="text"
                    value={card.context}
                    onChange={(e) => updateCard(card.id, "context", e.target.value)}
                    placeholder="e.g. Fasting"
                    className="w-full border border-cream-300 rounded-xl px-2 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong"
                  />
                </div>
              </div>
            </div>
          );
        })}

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={() => setCards((prev) => [...prev, newCard()])}
            className="text-sm text-teal-500 hover:underline"
          >
            + Add another vital
          </button>
          <div className="flex items-center gap-3">
            {saveError && <p className="text-sm text-rose-500">{saveError}</p>}
            <button
              onClick={handleSaveAll}
              disabled={isSaving || filledCount === 0}
              className="px-4 py-2 bg-teal-500 text-white text-sm font-medium rounded-xl hover:bg-teal-600 disabled:opacity-50 transition-colors"
            >
              {isSaving ? "Saving…" : `Save ${filledCount} vital${filledCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
