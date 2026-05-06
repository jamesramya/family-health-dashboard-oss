interface SparkProps {
  values: number[];
  low?: number;
  high?: number;
  width?: number;
  height?: number;
  color?: string;
}

export function Spark({
  values,
  low,
  high,
  width = 120,
  height = 32,
  color = "#2f6b5f",
}: SparkProps) {
  if (!values.length) return null;

  const vals = [...values].reverse();
  const min = Math.min(...vals, low ?? Infinity);
  const max = Math.max(...vals, high ?? -Infinity);
  const pad = (max - min) * 0.1 || 1;
  const yMin = min - pad;
  const yMax = max + pad;

  const toX = (i: number) =>
    vals.length === 1 ? width / 2 : (i / (vals.length - 1)) * (width - 4) + 2;
  const toY = (v: number) =>
    height - ((v - yMin) / (yMax - yMin)) * (height - 4) - 2;

  const pts = vals.map((v, i) => [toX(i), toY(v)] as [number, number]);
  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = pts[pts.length - 1];

  let band: JSX.Element | null = null;
  if (low != null && high != null) {
    const yHi = toY(high);
    const yLo = toY(low);
    band = (
      <rect
        x="0"
        y={Math.min(yHi, yLo)}
        width={width}
        height={Math.max(1, Math.abs(yLo - yHi))}
        fill={color}
        opacity="0.08"
      />
    );
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {band}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}
