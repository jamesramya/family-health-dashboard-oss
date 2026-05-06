import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from "recharts";
import type { VitalReading } from "@/types/api";
import { formatVitalDate, formatChartDate } from "@/lib/format";

export interface ReferenceRange {
  y1: number;
  y2?: number;
  color: string;
}

interface VitalChartProps {
  readings: VitalReading[];
  color?: string;
  label: string;
  unit: string;
  showSecondary?: boolean;
  secondaryLabel?: string;
  referenceRanges?: ReferenceRange[];
  referenceUnit?: string;
}

function usePrefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function AnimatedDot(props: { cx?: number; cy?: number; fill?: string; r?: number }) {
  const { cx, cy, fill, r = 5 } = props;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      style={{
        transition:
          "r 150ms cubic-bezier(0.23, 1, 0.32, 1), opacity 150ms cubic-bezier(0.23, 1, 0.32, 1)",
      }}
    />
  );
}

export function VitalChart({
  readings,
  color = "#3b82f6",
  label,
  unit,
  showSecondary = false,
  secondaryLabel,
  referenceRanges,
  referenceUnit,
}: VitalChartProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const data = [...readings]
    .sort((a, b) => new Date(a.measured_at).getTime() - new Date(b.measured_at).getTime())
    .map((r) => ({
      isoDate: r.measured_at,
      date: formatChartDate(r.measured_at),
      value: r.value_primary,
      secondary: r.value_secondary ?? undefined,
    }));

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-ink-muted text-sm">
        No data
      </div>
    );
  }

  const allValues = data.flatMap((d) =>
    [d.value, d.secondary].filter((v): v is number => v !== undefined)
  );
  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const padding = Math.max((dataMax - dataMin) * 0.15, 5);
  const domainMin = Math.floor(dataMin - padding);
  const domainMax = Math.ceil(dataMax + padding);

  const animationActive = !hasMounted && !prefersReducedMotion;

  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal vertical={false} stroke="#f3f4f6" strokeDasharray="" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[domainMin, domainMax]}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            labelFormatter={(_label, payload) => {
              const isoDate = payload?.[0]?.payload?.isoDate as string | undefined;
              return isoDate ? formatVitalDate(isoDate) : _label;
            }}
            formatter={(value: number, name: string) => [
              `${value} ${unit}`,
              name === "value" ? label : (secondaryLabel ?? "Secondary"),
            ]}
          />
          {referenceRanges && (!referenceUnit || readings.every((r) => r.unit === referenceUnit)) && referenceRanges.map((r) => (
            <ReferenceArea
              key={r.y1}
              y1={r.y1}
              y2={r.y2 ?? domainMax}
              fill={r.color}
              fillOpacity={0.06}
              ifOverflow="extendDomain"
            />
          ))}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3, fill: color, strokeWidth: 0 }}
            activeDot={<AnimatedDot r={6} />}
            isAnimationActive={animationActive}
            animationDuration={600}
            animationEasing="ease-out"
          />
          {showSecondary && (
            <Line
              type="monotone"
              dataKey="secondary"
              stroke="#f97316"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              strokeOpacity={0.6}
              dot={{ r: 3, fill: "#f97316", strokeWidth: 0 }}
              activeDot={<AnimatedDot r={6} />}
              isAnimationActive={animationActive}
              animationDuration={600}
              animationEasing="ease-out"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
