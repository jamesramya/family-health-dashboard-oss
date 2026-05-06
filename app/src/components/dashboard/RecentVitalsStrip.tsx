import { Link } from "react-router-dom";
import { Spark } from "@/components/ui/Spark";
import { relTimeCompact } from "@/lib/format";
import type { VitalReading, VitalType } from "@/types/api";

interface RecentVitalsStripProps {
  readings: VitalReading[];
}

const LABELS: Record<VitalType, string> = {
  bp:          "Blood pressure",
  glucose:     "Glucose",
  weight:      "Weight",
  heart_rate:  "Heart rate",
  spo2:        "SpO₂",
  temperature: "Temperature",
};

const TREND_COLORS: Record<VitalType, string> = {
  bp:          "#c25a4d",
  heart_rate:  "#c4923f",
  spo2:        "#5e8b7e",
  weight:      "#9b7eb8",
  glucose:     "#7a6dad",
  temperature: "#c98a3f",
};

function latestValueLabel(r: VitalReading): string {
  if (r.type === "bp" && r.value_secondary != null) {
    return `${r.value_primary}/${r.value_secondary}`;
  }
  return String(r.value_primary);
}

export function RecentVitalsStrip({ readings }: RecentVitalsStripProps) {
  if (readings.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-ink-muted">No recent readings yet.</p>
        <Link to="/vitals" className="inline-block mt-2 text-sm text-teal-600 hover:underline">
          Log a reading →
        </Link>
      </div>
    );
  }

  const grouped = new Map<VitalType, VitalReading[]>();
  for (const r of readings) {
    const arr = grouped.get(r.type) ?? [];
    arr.push(r);
    grouped.set(r.type, arr);
  }

  return (
    <ul className="space-y-3">
      {Array.from(grouped.entries()).map(([type, list]) => {
        const sorted = [...list].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
        const latest = sorted[0];
        const series = sorted.slice(0, 30).map((r) => r.value_primary);
        return (
          <li key={type}>
            <Link
              to="/vitals"
              className="flex items-center gap-3 rounded-xl px-2 py-2 [@media(hover:hover)]:hover:bg-cream-100 transition-colors duration-160"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink-soft font-medium flex items-baseline gap-1.5">
                  {LABELS[type]}
                  <span className="text-[11px] font-normal normal-case tracking-normal tabular text-ink-faint/70">{relTimeCompact(latest.measured_at)}</span>
                </p>
                <p className="text-xl font-semibold text-ink tabular">
                  {latestValueLabel(latest)}
                  <span className="ml-1.5 text-xs font-normal text-ink-faint">{latest.unit}</span>
                </p>
              </div>
              <Spark values={series} width={100} height={28} color={TREND_COLORS[type]} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
