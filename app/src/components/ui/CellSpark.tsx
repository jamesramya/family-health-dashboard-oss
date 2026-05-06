interface CellSparkProps {
  prev: number | null;
  curr: number | null;
  low?: number | null;
  high?: number | null;
  color?: string;
  width?: number;
  height?: number;
}

export function CellSpark({
  prev,
  curr,
  low,
  high,
  color = "#2f6b5f",
  width = 48,
  height = 14,
}: CellSparkProps) {
  if (prev == null || curr == null) return <div style={{ height }} />;

  const candidates = [prev, curr, low, high].filter(
    (v): v is number => v != null
  );
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const range = max - min || 1;
  const toY = (v: number) => height - 2 - ((v - min) / range) * (height - 4);

  const x1 = 2;
  const x2 = width - 2;

  let band: JSX.Element | null = null;
  if (low != null && high != null) {
    const yH = toY(high);
    const yL = toY(low);
    band = (
      <rect
        x="0"
        y={Math.min(yH, yL)}
        width={width}
        height={Math.max(1, Math.abs(yL - yH))}
        fill="#6b9f58"
        opacity="0.12"
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block mx-auto"
      aria-hidden
    >
      {band}
      <line
        x1={x1}
        y1={toY(prev)}
        x2={x2}
        y2={toY(curr)}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx={x1} cy={toY(prev)} r="1.4" fill={color} opacity="0.5" />
      <circle cx={x2} cy={toY(curr)} r="2" fill={color} />
    </svg>
  );
}
