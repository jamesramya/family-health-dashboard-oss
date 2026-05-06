import type { ReactNode } from "react";

interface SettingsRowProps {
  title: string;
  desc?: string;
  action?: ReactNode;
  danger?: boolean;
}

export function SettingsRow({ title, desc, action, danger }: SettingsRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${danger ? "text-rose-600" : "text-ink"}`}>{title}</p>
        {desc && <p className="text-sm text-ink-muted mt-0.5">{desc}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
