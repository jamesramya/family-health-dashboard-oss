import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}

export function Card({ children, padded = true, className = "" }: CardProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-cream-200 shadow-card ${padded ? "p-6" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
