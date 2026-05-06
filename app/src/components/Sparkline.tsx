import { useEffect, useState } from "react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

interface SparklineProps {
  data: number[];
  color?: string;
}

function usePrefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Sparkline({ data, color = "#3b82f6" }: SparklineProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  if (data.length < 2) {
    return <div className="w-[90px] h-[30px]" />;
  }

  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ width: 90, height: 30 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={!hasMounted && !prefersReducedMotion}
            animationDuration={600}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
