interface Props {
  scanType: string | "all";
  bodyArea: string | "all";
  dateRange: "all" | "1y" | "2y" | "5y";
  scanTypes: string[];
  bodyAreas: string[];
  onScanType: (v: string | "all") => void;
  onBodyArea: (v: string | "all") => void;
  onDateRange: (v: "all" | "1y" | "2y" | "5y") => void;
}

export function ScanFilters(p: Props) {
  const pill = (active: boolean) =>
    `min-h-[40px] px-3 rounded-full text-sm font-medium transition-[transform,background-color] duration-160 ease-out-strong active:scale-[0.96] ${
      active ? "bg-teal-600 text-cream-50" : "bg-cream-100 text-ink-soft [@media(hover:hover)]:hover:bg-cream-200"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={p.scanType} onChange={(e) => p.onScanType(e.target.value)}
        className="min-h-[40px] rounded-full bg-cream-100 border border-cream-200 px-3 text-sm text-ink-soft focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong focus:outline-none">
        <option value="all">All types</option>
        {p.scanTypes.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={p.bodyArea} onChange={(e) => p.onBodyArea(e.target.value)}
        className="min-h-[40px] rounded-full bg-cream-100 border border-cream-200 px-3 text-sm text-ink-soft focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong focus:outline-none">
        <option value="all">All body areas</option>
        {p.bodyAreas.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      {(["all", "1y", "2y", "5y"] as const).map((r) => (
        <button key={r} onClick={() => p.onDateRange(r)} className={pill(p.dateRange === r)}>
          {r === "all" ? "All time" : `Last ${r.replace("y", " yr")}`}
        </button>
      ))}
    </div>
  );
}
