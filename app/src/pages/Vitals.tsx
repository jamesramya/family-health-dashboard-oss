import { useState } from "react";
import { Pencil } from "lucide-react";
import { useVitals } from "@/hooks/use-vitals";
import { useDefaultPatientId } from "@/hooks/use-admin";
import { VitalLogPanel } from "@/components/VitalLogPanel";
import { VitalChart } from "@/components/VitalChart";
import { VitalEditRow } from "@/components/VitalEditRow";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Btn } from "@/components/ui/Btn";
import { Spinner } from "@/components/ui/Spinner";
import { formatVitalDate } from "@/lib/format";
import type { VitalType } from "@/types/api";
import type { ReferenceRange } from "@/components/VitalChart";

interface VitalTypeConfig {
  value: VitalType;
  label: string;
  unit: string;
  color: string;
  showSecondary?: boolean;
  secondaryLabel?: string;
  referenceRanges?: ReferenceRange[];
  referenceUnit?: string;
}

const VITAL_TYPES: VitalTypeConfig[] = [
  {
    value: "bp",
    label: "Blood Pressure",
    unit: "mmHg",
    color: "#ef4444",
    showSecondary: true,
    secondaryLabel: "Diastolic",
    // no referenceRanges — systolic bands would be misleading alongside diastolic line
  },
  {
    value: "heart_rate",
    label: "Heart Rate",
    unit: "bpm",
    color: "#f97316",
    referenceRanges: [{ y1: 60, y2: 100, color: "#22c55e" }],
  },
  {
    value: "temperature",
    label: "Temperature",
    unit: "°C",
    color: "#eab308",
    referenceRanges: [{ y1: 36.1, y2: 37.2, color: "#22c55e" }],
    referenceUnit: "°C",
  },
  {
    value: "weight",
    label: "Weight",
    unit: "kg",
    color: "#22c55e",
  },
  {
    value: "spo2",
    label: "Oxygen Saturation",
    unit: "%",
    color: "#3b82f6",
    referenceRanges: [
      { y1: 95, y2: 100, color: "#22c55e" },
      { y1: 0, y2: 95, color: "#ef4444" },
    ],
  },
  {
    value: "glucose",
    label: "Blood Glucose",
    unit: "mmol/L",
    color: "#8b5cf6",
  },
];

function localDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgoISO(days: number): string {
  return localDateISO(new Date(Date.now() - days * 86400000));
}

function todayISO(): string {
  return localDateISO(new Date());
}

type DatePreset = "7d" | "30d" | "90d" | "all";

export function Vitals() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const [showEntry, setShowEntry] = useState(false);
  const [selectedType, setSelectedType] = useState<VitalType | "all">("all");

  const [preset, setPreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const isCustom = customFrom !== "" || customTo !== "";

  const dateFrom: string | undefined = isCustom
    ? customFrom || undefined
    : preset === "all"
    ? undefined
    : preset === "7d"
    ? daysAgoISO(7)
    : preset === "30d"
    ? daysAgoISO(30)
    : daysAgoISO(90);

  const dateTo: string | undefined = isCustom
    ? customTo || undefined
    : preset === "all"
    ? undefined
    : todayISO();

  const filterActive = preset !== "all" || isCustom || selectedType !== "all";

  const { data, isLoading, error, refetch } = useVitals(
    patientId ?? "",
    {
      ...(selectedType !== "all" ? { type: selectedType } : {}),
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
    }
  );

  if (patientLoading) return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
  if (!patientId) return <p className="text-center py-16 text-ink-muted">No patient found. Please complete setup first.</p>;

  const readings = data?.vitals ?? [];

  const sortedReadings = readings
    .slice()
    .sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

  // Group by type for charts
  const byType = new Map<VitalType, typeof readings>();
  for (const r of readings) {
    if (!byType.has(r.type)) byType.set(r.type, []);
    byType.get(r.type)!.push(r);
  }

  const displayTypes = selectedType === "all"
    ? VITAL_TYPES.filter((t) => byType.has(t.value))
    : VITAL_TYPES.filter((t) => t.value === selectedType);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <SectionHeader
        eyebrow="Vitals"
        title="Vitals"
        subtitle="Readings you take at home — blood pressure, heart rate, weight and more."
        action={
          <Btn onClick={() => setShowEntry((s) => !s)}>
            {showEntry ? "Cancel" : "+ Log Vital"}
          </Btn>
        }
      />

      {/* Entry panel */}
      {showEntry && (
        <div className="bg-white rounded-xl border border-cream-200 p-5 max-w-2xl mx-auto">
          <h2 className="text-base font-semibold text-ink mb-4">Log Vitals</h2>
          <VitalLogPanel patientId={patientId} onSuccess={() => setShowEntry(false)} />
        </div>
      )}

      {/* Date range controls */}
      <div className="flex flex-wrap items-center gap-2">
        {(["7d", "30d", "90d", "all"] as const).map((p) => (
          <button
            key={p}
            onClick={() => { setPreset(p); setCustomFrom(""); setCustomTo(""); }}
            className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
              preset === p && !isCustom
                ? "bg-teal-600 text-cream-50"
                : "border border-cream-300 text-ink-soft hover:bg-cream-100"
            }`}
          >
            {p === "7d" ? "Last 7 days" : p === "30d" ? "Last 30 days" : p === "90d" ? "Last 90 days" : "All time"}
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => { setCustomFrom(e.target.value); }}
            className={`border rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong ${
              isCustom ? "border-teal-500" : "border-cream-300"
            }`}
          />
          <span className="text-ink-faint text-sm">–</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => { setCustomTo(e.target.value); }}
            className={`border rounded-xl px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong ${
              isCustom ? "border-teal-500" : "border-cream-300"
            }`}
          />
        </div>
      </div>

      {/* Filter by type */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedType("all")}
          className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
            selectedType === "all"
              ? "bg-ink text-cream-50"
              : "border border-cream-300 text-ink-soft hover:bg-cream-100"
          }`}
        >
          All
        </button>
        {VITAL_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={`px-3 py-1.5 text-sm rounded-full font-medium transition-colors ${
              selectedType === t.value
                ? "bg-ink text-cream-50"
                : "border border-cream-300 text-ink-soft hover:bg-cream-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
          <p className="text-sm text-rose-700 font-medium">Failed to load vitals.</p>
          <button onClick={() => void refetch()} className="mt-1 text-sm text-teal-600 hover:underline">
            Try again
          </button>
        </div>
      )}

      {/* Charts */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : readings.length === 0 ? (
        filterActive ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-ink-muted">No readings in this period.</p>
            <button
              onClick={() => { setPreset("all"); setCustomFrom(""); setCustomTo(""); }}
              className="text-sm text-teal-600 hover:underline"
            >
              Show all time
            </button>
          </div>
        ) : (
          <p className="text-center text-ink-muted py-12">No vitals recorded yet.</p>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {displayTypes.map((vt) => {
            const typeReadings = byType.get(vt.value) ?? [];
            return (
              <div key={vt.value} className="bg-white rounded-xl border border-cream-200 p-5">
                <h3 className="text-sm font-semibold text-ink mb-1">
                  {vt.label}
                </h3>
                <p className="text-xs text-ink-faint mb-3">
                  {typeReadings.length} readings
                </p>
                <VitalChart
                  readings={typeReadings}
                  label={vt.label}
                  unit={vt.unit}
                  color={vt.color}
                  showSecondary={vt.showSecondary}
                  secondaryLabel={vt.secondaryLabel}
                  referenceRanges={vt.referenceRanges}
                  referenceUnit={vt.referenceUnit}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Readings table */}
      {!isLoading && readings.length > 0 && (
        <div className="bg-white rounded-xl border border-cream-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-cream-200">
            <h3 className="text-sm font-semibold text-ink">All Readings</h3>
          </div>

          {/* Mobile: stacked cards */}
          <ul className="md:hidden divide-y divide-cream-100">
            {sortedReadings.map((r) => {
              const vt = VITAL_TYPES.find((t) => t.value === r.type);
              const display =
                r.value_secondary != null
                  ? `${r.value_primary}/${r.value_secondary} ${r.unit}`
                  : `${r.value_primary} ${r.unit}`;

              if (editingId === r.id) {
                return (
                  <li key={r.id} className="px-5 py-3">
                    <VitalEditRow
                      reading={r}
                      patientId={patientId}
                      onDone={() => setEditingId(null)}
                    />
                  </li>
                );
              }

              return (
                <li key={r.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {vt?.label ?? r.type.replace(/_/g, " ")}
                    </p>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {formatVitalDate(r.measured_at)}
                      {r.context ? ` · ${r.context}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-bold whitespace-nowrap" style={{ color: vt?.color }}>
                      {display}
                    </p>
                    <button
                      onClick={() => setEditingId(r.id)}
                      className="text-ink-faint hover:text-teal-600 transition-colors flex-shrink-0"
                      aria-label="Edit reading"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto fade-scroll-right">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cream-50 border-b border-cream-200">
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Type</th>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Value</th>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Date & Time</th>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Context</th>
                  <th className="text-left px-4 py-2 font-medium text-ink-soft">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {sortedReadings.map((r) => {
                  const vt = VITAL_TYPES.find((t) => t.value === r.type);
                  const display =
                    r.value_secondary != null
                      ? `${r.value_primary}/${r.value_secondary} ${r.unit}`
                      : `${r.value_primary} ${r.unit}`;

                  if (editingId === r.id) {
                    return (
                      <tr key={r.id}>
                        <td colSpan={5} className="px-4 py-3">
                          <VitalEditRow
                            reading={r}
                            patientId={patientId}
                            onDone={() => setEditingId(null)}
                          />
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={r.id} className="hover:bg-cream-50">
                      <td className="px-4 py-2 font-medium text-ink">
                        {vt?.label ?? r.type.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-2 font-bold" style={{ color: vt?.color }}>
                        {display}
                      </td>
                      <td className="px-4 py-2 text-ink-soft">{formatVitalDate(r.measured_at)}</td>
                      <td className="px-4 py-2 text-ink-muted">{r.context ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs capitalize bg-cream-100 text-ink-soft px-2 py-0.5 rounded">
                            {r.source.replace(/_/g, " ")}
                          </span>
                          <button
                            onClick={() => setEditingId(r.id)}
                            className="text-ink-faint hover:text-teal-600 transition-colors"
                            aria-label="Edit reading"
                          >
                            <Pencil size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
