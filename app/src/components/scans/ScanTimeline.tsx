import { formatDate } from "@/lib/format";
import type { ScanFinding } from "@/types/api";

interface Props {
  scans: ScanFinding[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ScanTimeline({ scans, selectedId, onSelect }: Props) {
  const byYear = new Map<string, ScanFinding[]>();
  for (const s of scans) {
    const y = s.scan_date ? new Date(s.scan_date).getFullYear().toString() : "Unknown";
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(s);
  }

  return (
    <div className="space-y-6">
      {[...byYear.entries()].map(([year, list]) => (
        <div key={year}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xl font-semibold text-ink">{year}</h3>
            <div className="flex-1 h-px bg-cream-200" />
          </div>
          <ul className="space-y-2">
            {list.map((s) => {
              const sel = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => onSelect(s.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-colors ${
                      sel
                        ? "bg-teal-50 border-teal-500/30 ring-1 ring-teal-500/30"
                        : "bg-cream-50 border-cream-200 [@media(hover:hover)]:hover:bg-cream-100"
                    }`}
                  >
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`font-semibold ${sel ? "text-teal-700" : "text-ink"}`}>{s.scan_type}</span>
                      {s.body_area && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-cream-200 text-ink-soft">{s.body_area}</span>
                      )}
                    </div>
                    {s.scan_date && (
                      <p className="text-xs text-ink-muted mt-1 font-mono">
                        {formatDate(s.scan_date)}
                        {s.ordering_doctor && ` · Dr. ${s.ordering_doctor}`}
                      </p>
                    )}
                    {s.findings_summary && (
                      <p className="text-sm text-ink-soft mt-2 line-clamp-2">{s.findings_summary}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
