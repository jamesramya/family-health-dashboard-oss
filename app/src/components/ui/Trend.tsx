import { ArrowUp, ArrowDown, Minus } from "lucide-react";

interface TrendProps {
  readings: number[];
  invert?: boolean;
}

export function Trend({ readings, invert = false }: TrendProps) {
  if (readings.length < 2) {
    return <span className="text-ink-faint">—</span>;
  }

  const prev = readings[readings.length - 2];
  const curr = readings[readings.length - 1];
  const delta = curr - prev;
  const relChange = Math.abs(delta / (prev || 1));

  if (relChange < 0.02) {
    return <Minus size={14} className="text-ink-faint" aria-label="stable" />;
  }

  const rising = delta > 0;
  const good = invert ? !rising : rising;

  return (
    <span
      className={good ? "text-sage-600" : "text-rose-500"}
      aria-label={rising ? "rising" : "falling"}
    >
      {rising ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
    </span>
  );
}
