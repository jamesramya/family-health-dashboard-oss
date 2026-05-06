import { Card } from "@/components/ui";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import type { UserPreferences } from "@/contexts/PreferencesContext";

type K = keyof UserPreferences;

function Group<T extends K>({
  label, current, options, onChange,
}: {
  label: string;
  name: T;
  current: UserPreferences[T] | undefined;
  options: { value: UserPreferences[T]; label: string }[];
  onChange: (v: UserPreferences[T]) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">{label}</p>
      <div className="flex gap-1 bg-cream-100 rounded-full p-1 w-fit">
        {options.map((o) => {
          const sel = current === o.value;
          return (
            <button
              key={String(o.value)}
              role="radio"
              aria-checked={sel}
              aria-label={o.label}
              onClick={() => onChange(o.value)}
              className={`min-h-[36px] px-4 rounded-full text-sm font-medium transition-colors ${
                sel ? "bg-white text-ink shadow-card" : "text-ink-soft hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Appearance() {
  const { prefs, setPref } = useUserPreferences();
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Appearance</h2>
        <p className="text-sm text-ink-muted">Tune the look and reading comfort.</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">Theme</p>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-cream-200 text-ink-soft text-sm font-medium rounded-full">Family Health</span>
          <button type="button" disabled className="text-sm text-teal-600 hover:underline opacity-40 cursor-not-allowed">Change</button>
        </div>
        <p className="mt-1 text-xs text-ink-faint">Family Health is the current theme.</p>
      </div>
      <Group label="Text size" name="textSize" current={prefs?.textSize}
        options={[{ value: "normal", label: "Normal" }, { value: "large", label: "Large" }, { value: "xl", label: "XL" }]}
        onChange={(v) => setPref("textSize", v)} />
      <Group label="Density" name="density" current={prefs?.density}
        options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]}
        onChange={(v) => setPref("density", v)} />
      <Group label="Status language" name="statusLanguage" current={prefs?.statusLanguage}
        options={[{ value: "plain", label: "Plain English" }, { value: "medical", label: "Clinical HIGH-LOW" }]}
        onChange={(v) => setPref("statusLanguage", v)} />
      <Group label="Language" name="language" current={prefs?.language}
        options={[
          { value: "en", label: "English" },
          { value: "ta", label: "Tamil" },
          { value: "fr", label: "Français" },
        ]}
        onChange={(v) => setPref("language", v)} />
    </Card>
  );
}
