import { useState } from "react";
import { Pencil, Plus, Printer, Search } from "lucide-react";
import { useMedications } from "@/hooks/use-medications";
import { usePatients } from "@/hooks/use-admin";
import type { Medication, MedicationSchedule } from "@/types/api";
import { MedicationForm } from "@/components/MedicationForm";
import { MedicationEditRow } from "@/components/MedicationEditRow";
import { AddMedicationSheet } from "@/components/AddMedicationSheet";
import { DailyPillbox } from "@/components/DailyPillbox";
import { AsNeededRail } from "@/components/AsNeededRail";
import { LabTabs } from "@/components/LabTabs";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spinner } from "@/components/ui/Spinner";
import { useMedicationSearch } from "@/hooks/useMedicationSearch";
import { formatMedName } from "@/lib/medNames";
import { formatDate } from "@/lib/format";
import { useIsMobile } from "@/hooks/useIsMobile";
import { formatDayBadge } from "@/lib/medSchedule";

type Tab = "active" | "past";

export function Medications() {
  const { data: patientsData, isLoading: patientLoading } = usePatients();
  const patientId = patientsData?.patients?.[0]?.id;
  const patientName = patientsData?.patients?.[0]?.name;
  const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState("");
  const [showDesktopForm, setShowDesktopForm] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingForFullEditor, setEditingForFullEditor] = useState<(Medication & { schedules: MedicationSchedule[] }) | null>(null);
  const isMobile = useIsMobile();

  const { data, isLoading, error, refetch } = useMedications(patientId ?? "");
  const meds = data?.medications ?? [];

  const active = meds.filter((m) => m.is_active);
  const past = meds.filter((m) => !m.is_active);
  const source = tab === "active" ? active : past;
  const filtered = useMedicationSearch(source, query);

  if (patientLoading) return (
    <div className="py-16 flex justify-center">
      <Spinner size="lg" />
    </div>
  );
  if (!patientId) return (
    <p className="text-center py-16 text-ink-muted">No patient found. Please complete setup first.</p>
  );

  function openAdd() {
    if (isMobile) setShowMobileSheet(true);
    else setShowDesktopForm(true);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <SectionHeader
        eyebrow="Medications"
        title={patientName ? `What ${patientName} is taking` : "Medications"}
        subtitle={`${active.length} active · ${past.length} past`}
        action={
          <div className="flex gap-2">
            <Btn
              variant="secondary"
              size="md"
              icon={<Printer size={14} />}
              onClick={() => {
                window.open(`/medications/print?person=${patientId}&date=${today}`, "_blank");
              }}
            >
              Print
            </Btn>
            <Btn
              variant="primary"
              size="md"
              icon={<Plus size={14} />}
              onClick={openAdd}
            >
              Add medication
            </Btn>
          </div>
        }
      />

      <DailyPillbox medications={active} personId={patientId} personName={patientName} />

      <AsNeededRail medications={active} />

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <LabTabs
            tabs={[
              { id: "active", label: "Active", count: active.length },
              { id: "past",   label: "Past",   count: past.length   },
            ] as const}
            active={tab}
            onChange={setTab}
          />

          <div className="relative flex-1 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <input
              aria-label="Search medications"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or generic…"
              style={{ fontSize: 16 }}
              className="w-full h-10 pl-8 pr-3 bg-cream-50 border border-cream-300 rounded-xl outline-none focus:border-teal-500"
            />
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
            <p className="text-rose-600 text-sm font-medium">Failed to load medications.</p>
            <Btn variant="ghost" size="sm" onClick={() => void refetch()} className="mt-2">Try again</Btn>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-ink-muted py-12">
            {query ? `No medications match "${query}".` : "No medications."}
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((m) =>
              editingId === m.id ? (
                <MedicationEditRow
                  key={m.id}
                  medication={m}
                  patientId={patientId}
                  onDone={() => setEditingId(null)}
                  onOpenFullEditor={() => {
                    setEditingId(null);
                    setEditingForFullEditor(m);
                    setShowDesktopForm(true);
                  }}
                />
              ) : (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink tracking-wide">
                        {formatMedName(m.brand_name, m.generic_name)}
                      </p>
                      <p className="text-[11px] text-ink-muted tabular mt-1">
                        {m.dosage}
                        {m.start_date ? ` · since ${formatDate(m.start_date)}` : ""}
                      </p>
                      {m.reason && (
                        <p className="text-[11px] text-ink-faint mt-1 uppercase tracking-[0.14em]">
                          {m.reason}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label="Edit medication"
                      onClick={() => setEditingId(m.id)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-ink-faint hover:text-ink-soft hover:bg-cream-100 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                  {m.schedules.filter((s) => s.time_of_day !== "as_needed").length > 0 && (
                    <div className="mt-3 space-y-1">
                      {m.schedules
                        .filter((s) => s.time_of_day !== "as_needed")
                        .map((s) => (
                          <div key={s.id} className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium bg-cream-100 text-ink-soft px-2 py-0.5 rounded-full capitalize">
                              {s.time_of_day}
                            </span>
                            <span className="text-[11px] text-ink-muted">
                              {s.dose_quantity || m.dosage}
                            </span>
                            <span className="text-[11px] font-medium bg-cream-50 text-ink-faint border border-cream-200 px-2 py-0.5 rounded-full">
                              {formatDayBadge(s.days_of_week)}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              )
            )}
          </div>
        )}
      </section>

      {showDesktopForm && (
        <div className="fixed inset-0 bg-ink/45 flex items-center justify-center z-40 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-ink">
                {editingForFullEditor ? "Edit medication" : "Add medication"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => { setShowDesktopForm(false); setEditingForFullEditor(null); }}
                className="text-ink-muted text-2xl leading-none"
              >
                ×
              </button>
            </div>
            <MedicationForm
              patientId={patientId}
              existing={editingForFullEditor ?? undefined}
              initialSchedules={editingForFullEditor?.schedules}
              onSuccess={() => { setShowDesktopForm(false); setEditingForFullEditor(null); }}
              onCancel={() => { setShowDesktopForm(false); setEditingForFullEditor(null); }}
            />
          </Card>
        </div>
      )}

      <AddMedicationSheet
        isOpen={showMobileSheet}
        onClose={() => setShowMobileSheet(false)}
        onSaved={() => void refetch()}
        patientId={patientId}
        patientName={patientName ?? ""}
      />
    </div>
  );
}
