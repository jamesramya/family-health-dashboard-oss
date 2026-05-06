import type { ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ eyebrow, title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">
            {eyebrow}
          </p>
        )}
        <h2 className="font-sans text-[26px] font-semibold tracking-[-0.02em] leading-tight text-ink">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-ink-muted mt-1.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
