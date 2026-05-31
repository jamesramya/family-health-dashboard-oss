import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  useSharedRecord,
  useSharedLabs,
  useSharedVitals,
  useSharedMedications,
  useSharedScans,
  useSharedDocuments,
} from "@/hooks/use-shared-record";
import { formatDate } from "@/lib/format";
import { BloodWorkTable } from "@/components/BloodWorkTable";
import { VitalChart } from "@/components/VitalChart";
import { ScanTimeline } from "@/components/scans/ScanTimeline";
import { ScanDetailPanel } from "@/components/scans/ScanDetailPanel";
import { PhysicianMedicationList } from "@/components/PhysicianMedicationList";
import { PhysicianDocList } from "@/components/PhysicianDocList";

const TABS = ["overview", "labs", "vitals", "medications", "scans", "documents"] as const;
type TabKey = typeof TABS[number];

const VITAL_META: Record<string, { label: string; color: string; showSecondary?: boolean }> = {
  bp:          { label: "Blood Pressure", color: "#ef4444", showSecondary: true },
  glucose:     { label: "Glucose", color: "#f59e0b" },
  weight:      { label: "Weight", color: "#3b82f6" },
  heart_rate:  { label: "Heart Rate", color: "#ec4899" },
  spo2:        { label: "SpO₂", color: "#10b981" },
  temperature: { label: "Temperature", color: "#f97316" },
};

function daysAgoISO(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CenterMsg({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center px-4">
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold text-ink">{text}</p>
        {sub && <p className="text-sm text-ink-muted">{sub}</p>}
      </div>
    </div>
  );
}

function FilterPills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {label && <span className="text-xs text-ink-faint self-center mr-1">{label}</span>}
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            value === o.value ? "bg-teal-500 text-white" : "bg-cream-100 text-ink-soft hover:bg-cream-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OverviewTab({ token }: { token: string }) {
  const { data } = useSharedRecord(token);
  if (!data) return null;
  const { test_results, vitals } = data;

  const latestByLabel = test_results.reduce<typeof test_results>((acc, r) => {
    if (!acc.some((x) => x.label === r.label)) acc.push(r);
    return acc;
  }, []);

  const latestByType = vitals.reduce<typeof vitals>((acc, v) => {
    if (!acc.some((x) => x.type === v.type)) acc.push(v);
    return acc;
  }, []);

  return (
    <div className="space-y-4">
      {latestByLabel.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-soft">Latest Lab Results</h3>
          <div className="space-y-0">
            {latestByLabel.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0">
                <span className="text-sm text-ink">{r.label}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono px-1.5 py-0.5 rounded ${
                    r.flag === "HIGH" ? "bg-rose-50 text-rose-600" :
                    r.flag === "LOW"  ? "bg-amber-50 text-amber-600" :
                    "text-ink-soft"
                  }`}>
                    {r.value ?? r.value_text} {r.unit}
                  </span>
                  {r.flag !== "NORMAL" && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      r.flag === "HIGH" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {r.flag}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {latestByType.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-soft">Latest Vitals</h3>
          <div className="space-y-0">
            {latestByType.map((v, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-cream-100 last:border-0">
                <span className="text-sm text-ink">
                  {VITAL_META[v.type]?.label ?? v.type.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-ink-soft font-mono">
                  {v.value_primary}{v.value_secondary != null ? `/${v.value_secondary}` : ""} {v.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {latestByLabel.length === 0 && latestByType.length === 0 && (
        <p className="text-sm text-ink-muted">No data available yet.</p>
      )}
    </div>
  );
}

const LAB_DATE_OPTIONS = [
  { value: "last5" as const,  label: "Last 5" },
  { value: "last10" as const, label: "Last 10" },
  { value: "all" as const,    label: "All time" },
];

function LabsTab({ token }: { token: string }) {
  const { data, isLoading } = useSharedLabs(token);
  const [dateFilter, setDateFilter] = useState<"last5" | "last10" | "all">("last10");

  if (isLoading) return <p className="text-sm text-ink-muted py-4">Loading labs…</p>;
  if (!data || data.categories.length === 0) {
    return <p className="text-sm text-ink-muted py-4">No lab results.</p>;
  }

  const allDates = [...new Set(
    data.categories.flatMap((cat) => cat.tests.flatMap((t) => t.readings.map((r) => r.date)))
  )].sort((a, b) => b.localeCompare(a));

  const visibleDates =
    dateFilter === "last5"  ? new Set(allDates.slice(0, 5)) :
    dateFilter === "last10" ? new Set(allDates.slice(0, 10)) :
    new Set(allDates);

  return (
    <div className="space-y-3">
      <FilterPills options={LAB_DATE_OPTIONS} value={dateFilter} onChange={setDateFilter} />
      <BloodWorkTable categories={data.categories} visibleDates={visibleDates} />
    </div>
  );
}

const PRESET_OPTIONS = [
  { value: "7d" as const,  label: "7d" },
  { value: "30d" as const, label: "30d" },
  { value: "90d" as const, label: "90d" },
  { value: "all" as const, label: "All time" },
];

const VITAL_TYPE_OPTIONS = [
  { value: "all" as const, label: "All" },
  ...Object.entries(VITAL_META).map(([k, v]) => ({ value: k, label: v.label })),
];

function VitalsTab({ token }: { token: string }) {
  const [selectedType, setSelectedType] = useState("all");
  const [preset, setPreset] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const dateFrom = preset === "all" ? undefined : daysAgoISO(preset === "7d" ? 7 : preset === "30d" ? 30 : 90);
  const dateTo   = preset === "all" ? undefined : todayISO();

  const { data, isLoading } = useSharedVitals(token, {
    ...(selectedType !== "all" ? { type: selectedType } : {}),
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo   ? { dateTo }   : {}),
  });

  const byType = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["vitals"]>();
    for (const v of data?.vitals ?? []) {
      if (!map.has(v.type)) map.set(v.type, []);
      map.get(v.type)!.push(v);
    }
    return map;
  }, [data]);

  return (
    <div className="space-y-3">
      <FilterPills options={PRESET_OPTIONS} value={preset} onChange={setPreset} />
      <FilterPills options={VITAL_TYPE_OPTIONS} value={selectedType} onChange={setSelectedType} />
      {isLoading && <p className="text-sm text-ink-muted py-4">Loading vitals…</p>}
      {!isLoading && byType.size === 0 && (
        <p className="text-sm text-ink-muted py-4">No vitals for this period.</p>
      )}
      <div className="space-y-6">
        {Array.from(byType.entries()).map(([type, readings]) => {
          const meta = VITAL_META[type] ?? { label: type.replace(/_/g, " "), color: "#3b82f6" };
          return (
            <div key={type}>
              <h3 className="text-sm font-semibold text-ink-soft mb-2">{meta.label}</h3>
              <VitalChart
                readings={readings}
                color={meta.color}
                label={meta.label}
                unit={readings[0]?.unit ?? ""}
                showSecondary={meta.showSecondary}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MedicationsTab({ token }: { token: string }) {
  const { data, isLoading } = useSharedMedications(token);
  if (isLoading) return <p className="text-sm text-ink-muted py-4">Loading medications…</p>;
  if (!data) return null;
  return <PhysicianMedicationList medications={data.medications} />;
}

function ScansTab({ token }: { token: string }) {
  const { data, isLoading } = useSharedScans(token);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => data?.scans.find((s) => s.id === selectedId) ?? data?.scans[0] ?? null,
    [data, selectedId]
  );
  if (isLoading) return <p className="text-sm text-ink-muted py-4">Loading scans…</p>;
  if (!data || data.scans.length === 0) {
    return <p className="text-sm text-ink-muted py-4">No scans.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <ScanTimeline scans={data.scans} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
      {selected && <ScanDetailPanel scan={selected} hideDocumentLink />}
    </div>
  );
}

function DocumentsTab({ token }: { token: string }) {
  const { data, isLoading } = useSharedDocuments(token);
  const [search, setSearch] = useState("");
  const docs = useMemo(() => {
    const all = data?.documents ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(
      (d) => d.title.toLowerCase().includes(q) || d.type.toLowerCase().includes(q)
    );
  }, [data, search]);
  if (isLoading) return <p className="text-sm text-ink-muted py-4">Loading documents…</p>;
  return <PhysicianDocList docs={docs} search={search} onSearch={setSearch} token={token} />;
}

export function SharedRecord() {
  const { token } = useParams<{ token: string }>();
  const tk = token ?? "";

  const [tab, setTab] = useState<TabKey>(() => {
    const h = window.location.hash.replace("#", "") as TabKey;
    return TABS.includes(h) ? h : "overview";
  });

  function selectTab(t: TabKey) {
    setTab(t);
    window.location.hash = t;
  }

  const { data, isLoading, error } = useSharedRecord(tk);

  if (isLoading) return <CenterMsg text="Loading…" />;
  if (error) {
    const isExpired = error instanceof Error && error.message === "expired";
    return (
      <CenterMsg
        text={isExpired ? "This link has expired" : "Link not found"}
        sub={
          isExpired
            ? "Ask the person who shared this link to generate a new one."
            : "This link may have been revoked or never existed."
        }
      />
    );
  }
  if (!data) return null;

  const { patient } = data;

  return (
    <div className="min-h-screen bg-cream-50">
      <header className="bg-white border-b border-cream-200 px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
          <span className="text-white text-xs font-bold">FH</span>
        </div>
        <span className="text-base font-semibold text-ink">Family Health</span>
        <span className="ml-auto text-xs text-ink-muted">Read-only shared record</span>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="bg-white rounded-2xl border border-cream-200 p-6 space-y-1">
          <h1 className="text-2xl font-semibold text-ink">{patient.name}</h1>
          <p className="text-sm text-ink-muted">
            {patient.date_of_birth ? `Born ${formatDate(patient.date_of_birth)}` : ""}
            {patient.gender ? ` · ${patient.gender}` : ""}
            {patient.blood_type ? ` · ${patient.blood_type}` : ""}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-cream-200 overflow-hidden">
          <nav className="flex border-b border-cream-200 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => selectTab(t)}
                className={`px-4 py-3 text-sm whitespace-nowrap capitalize transition-colors ${
                  tab === t
                    ? "border-b-2 border-teal-500 text-teal-600 font-semibold"
                    : "text-ink-muted hover:text-ink-soft"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="p-4">
            {tab === "overview"    && <OverviewTab    token={tk} />}
            {tab === "labs"        && <LabsTab        token={tk} />}
            {tab === "vitals"      && <VitalsTab      token={tk} />}
            {tab === "medications" && <MedicationsTab token={tk} />}
            {tab === "scans"       && <ScansTab       token={tk} />}
            {tab === "documents"   && <DocumentsTab   token={tk} />}
          </div>
        </div>
      </main>
    </div>
  );
}
