import { useMemo, useState } from "react";
import { useScans } from "@/hooks/use-scans";
import { useDefaultPatientId } from "@/hooks/use-admin";
import { SectionHeader } from "@/components/ui";
import { BottomSheet } from "@/components/BottomSheet";
import { ScanFilters } from "@/components/scans/ScanFilters";
import { ScanTimeline } from "@/components/scans/ScanTimeline";
import { ScanDetailPanel } from "@/components/scans/ScanDetailPanel";

const RANGE_DAYS: Record<"all" | "1y" | "2y" | "5y", number | null> = {
  all: null, "1y": 365, "2y": 730, "5y": 1825,
};

export function Scans() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const { data, isLoading } = useScans(patientId ?? "");

  const [scanType, setScanType] = useState<string | "all">("all");
  const [bodyArea, setBodyArea] = useState<string | "all">("all");
  const [dateRange, setDateRange] = useState<"all" | "1y" | "2y" | "5y">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const scans = data?.scans ?? [];
  const scanTypes = useMemo(() => Array.from(new Set(scans.map((s) => s.scan_type))).sort(), [scans]);
  const bodyAreas = useMemo(() => Array.from(new Set(scans.map((s) => s.body_area).filter(Boolean))) as string[], [scans]);

  const filtered = useMemo(() => {
    const cutoff = RANGE_DAYS[dateRange];
    const now = Date.now();
    return scans
      .filter((s) => scanType === "all" || s.scan_type === scanType)
      .filter((s) => bodyArea === "all" || s.body_area === bodyArea)
      .filter((s) => {
        if (!cutoff) return true;
        if (!s.scan_date) return false;
        return now - new Date(s.scan_date).getTime() < cutoff * 86400_000;
      })
      .sort((a, b) => {
        if (!a.scan_date) return 1;
        if (!b.scan_date) return -1;
        return new Date(b.scan_date).getTime() - new Date(a.scan_date).getTime();
      });
  }, [scans, scanType, bodyArea, dateRange]);

  const selected = filtered.find((s) => s.id === selectedId) ?? null;

  function handleSelect(id: string) {
    setSelectedId(id);
    if (window.matchMedia("(max-width: 1023px)").matches) setMobileOpen(true);
  }

  if (patientLoading) return <div className="py-16 text-center text-ink-muted">Loading…</div>;
  if (!patientId) return <p className="py-16 text-center text-ink-muted">No patient found.</p>;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Imaging"
        title="Scans"
        subtitle={data ? `${scans.length} scan findings` : "Imaging reports and findings"}
      />

      <ScanFilters
        scanType={scanType} onScanType={setScanType}
        bodyArea={bodyArea} onBodyArea={setBodyArea}
        dateRange={dateRange} onDateRange={setDateRange}
        scanTypes={scanTypes} bodyAreas={bodyAreas}
      />

      {isLoading ? (
        <div className="py-12 text-center text-ink-muted">Loading…</div>
      ) : filtered.length === 0 ? (
        <p className="font-serif text-2xl text-ink-muted py-12 text-center">No scans match these filters.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <ScanTimeline scans={filtered} selectedId={selectedId} onSelect={handleSelect} />
          </div>
          <div className="hidden lg:block lg:col-span-2">
            {selected ? <ScanDetailPanel scan={selected} /> : (
              <p className="font-serif text-xl text-ink-muted p-8 text-center">Select a scan to see details.</p>
            )}
          </div>
        </div>
      )}

      <BottomSheet isOpen={mobileOpen && !!selected} onClose={() => setMobileOpen(false)} title="Scan">
        {selected && <ScanDetailPanel scan={selected} />}
      </BottomSheet>
    </div>
  );
}
