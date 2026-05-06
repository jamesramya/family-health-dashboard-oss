import { useState } from "react";
import { Upload } from "lucide-react";
import { useBloodWork } from "@/hooks/use-blood-work";
import { useDefaultPatientId, usePatient } from "@/hooks/use-admin";
import { BloodWorkTable } from "@/components/BloodWorkTable";
import { BloodWorkMobileList } from "@/components/BloodWorkMobileList";
import { CulturesTab } from "@/components/CulturesTab";
import { LabRowDetailSheet } from "@/components/LabRowDetailSheet";
import { LabTabs } from "@/components/LabTabs";
import { Btn } from "@/components/ui/Btn";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spinner } from "@/components/ui/Spinner";
import type { BloodWorkCategoryItem, TestCategory } from "@/types/api";
import { useIsMobile } from "@/hooks/useIsMobile";

type Tab = "blood" | "cultures" | "urine";
type DateFilter = "last5" | "last10" | "all" | "custom";

const FILTER_LABELS: Record<DateFilter, string> = {
  last5: "Last 5 reports",
  last10: "Last 10",
  all: "All time",
  custom: "Custom",
};

const CATEGORY_LABELS: Record<TestCategory, string> = {
  haematology: "Haematology",
  electrolytes: "Electrolytes",
  liver_function: "Liver Function",
  renal_function: "Renal Function",
  bone_profile: "Bone Profile",
  coagulation: "Coagulation",
  drug_levels: "Drug Levels",
  inflammatory: "Inflammatory Markers",
  thyroid_function: "Thyroid Function",
  blood_glucose: "Blood Glucose",
  lipid_profile: "Lipid Profile",
  other: "Other",
};

export function BloodWork() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const { data, isLoading, error, refetch } = useBloodWork(patientId ?? "");
  const [activeTab, setActiveTab] = useState<Tab>("blood");
  const [dateFilter, setDateFilter] = useState<DateFilter>("last10");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selected, setSelected] = useState<
    { test: BloodWorkCategoryItem; category: TestCategory } | null
  >(null);
  const isMobile = useIsMobile();
  const { data: patientData } = usePatient(patientId ?? "");
  const patientName = patientData?.patient?.name ?? "";

  if (patientLoading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  );
  if (!patientId)
    return <p className="text-center py-16 text-ink-muted">No patient found. Please complete setup first.</p>;

  const categories = data?.categories ?? [];

  const allDates = [...new Set(
    categories.flatMap((cat) => cat.tests.flatMap((t) => t.readings.map((r) => r.date)))
  )].sort((a, b) => b.localeCompare(a));

  let visibleDates: Set<string>;
  if (dateFilter === "last5") visibleDates = new Set(allDates.slice(0, 5));
  else if (dateFilter === "last10") visibleDates = new Set(allDates.slice(0, 10));
  else if (dateFilter === "custom")
    visibleDates = new Set(
      allDates.filter((d) => (!customFrom || d >= customFrom) && (!customTo || d <= customTo))
    );
  else visibleDates = new Set(allDates);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <SectionHeader
        eyebrow={patientName ? `${patientName} · Lab results` : "Lab results"}
        title={
          activeTab === "blood"
            ? "Blood tests over time"
            : activeTab === "cultures"
            ? "Culture & sensitivity"
            : "Urine analysis"
        }
        subtitle={
          activeTab === "blood"
            ? "Values outside the normal range are flagged. Each cell's micro line shows change from the previous reading."
            : activeTab === "cultures"
            ? "Blood, sputum, urine and swab cultures — with organism and antibiotic sensitivity."
            : "Urine analysis coming soon."
        }
        action={
          <Btn
            icon={<Upload size={14} />}
            onClick={() =>
              window.dispatchEvent(new CustomEvent("fh:quickadd-action", { detail: "lab" }))
            }
          >
            Upload results
          </Btn>
        }
      />

      <LabTabs
        tabs={[
          { id: "blood", label: "Blood" },
          { id: "cultures", label: "Cultures" },
          { id: "urine", label: "Urine" },
        ] as const}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "blood" && (
        <>
          {!isLoading && !isMobile && categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(FILTER_LABELS) as DateFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setDateFilter(f)}
                  className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium transition-colors ${
                    dateFilter === f
                      ? "bg-teal-600 text-cream-50"
                      : "bg-white border border-cream-300 text-ink-soft [@media(hover:hover)]:hover:bg-cream-100"
                  }`}
                >
                  {FILTER_LABELS[f]}
                </button>
              ))}
              {dateFilter === "custom" && (
                <>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    aria-label="From date"
                    className="border border-cream-300 bg-white rounded-lg px-2 py-1.5 text-sm min-h-[44px]"
                  />
                  <span className="text-ink-faint text-sm">to</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    aria-label="To date"
                    className="border border-cream-300 bg-white rounded-lg px-2 py-1.5 text-sm min-h-[44px]"
                  />
                </>
              )}
              {allDates.length > 0 && (
                <span className="text-sm text-ink-faint ml-auto tabular">
                  Showing {visibleDates.size} of {allDates.length} reports
                </span>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
              <p className="text-rose-600 text-sm font-medium">Failed to load blood work results.</p>
              <Btn variant="ghost" size="sm" onClick={() => void refetch()} className="mt-2">
                Try again
              </Btn>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : isMobile ? (
            <BloodWorkMobileList
              categories={categories}
              onRowTap={(test, category) => setSelected({ test, category })}
            />
          ) : (
            <BloodWorkTable
              categories={categories}
              visibleDates={visibleDates}
            />
          )}
        </>
      )}

      {activeTab === "cultures" && <CulturesTab patientId={patientId} />}

      {activeTab === "urine" && (
        <p className="text-center py-16 text-ink-muted text-sm">
          Urine analysis coming soon. For now, check the Cultures tab for urine-specimen results.
        </p>
      )}

      {selected && (
        <LabRowDetailSheet
          test={selected.test}
          categoryLabel={CATEGORY_LABELS[selected.category]}
          isOpen
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
