interface Tab<Id extends string = string> {
  id: Id;
  label: string;
  count?: number;
}

interface LabTabsProps<Id extends string = string> {
  tabs: readonly Tab<Id>[];
  active: Id;
  onChange: (id: Id) => void;
}

export function LabTabs<Id extends string>({ tabs, active, onChange }: LabTabsProps<Id>) {
  return (
    <div role="tablist" className="flex border-b border-cream-200 gap-1">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`px-4 py-2.5 text-sm font-medium -mb-px border-b-2 whitespace-nowrap transition-colors duration-200 ease-out-strong ${
              isActive
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count != null && (
              <span className={`ml-1.5 text-[11px] tabular ${isActive ? "text-teal-600" : "text-ink-faint"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
