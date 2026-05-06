import { STATUS_MAP, PERSON_STATUS_MAP } from "../../lib/status";
import type { TestStatus, PersonStatus, StatusTone } from "../../lib/status";
import { usePreferences } from "../../contexts/PreferencesContext";

const TONE_CLASSES: Record<StatusTone, string> = {
  sage:  "bg-sage-50 text-sage-600",
  amber: "bg-amber-50 text-amber-600",
  rose:  "bg-rose-50 text-rose-600",
  muted: "bg-cream-200 text-ink-muted",
};

export function StatusPill({ status }: { status: TestStatus }) {
  const { prefs } = usePreferences();
  const s = STATUS_MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}
      title={`${s.medical}${s.plain !== s.medical ? " · " + s.plain : ""}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} aria-hidden />
      {prefs.statusLanguage === "plain" ? s.plain : s.medical}
    </span>
  );
}

export function PersonStatusPill({ status }: { status: PersonStatus }) {
  const { prefs } = usePreferences();
  const s = PERSON_STATUS_MAP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[s.tone]}`}
      title={`${s.medical}${s.plain !== s.medical ? " · " + s.plain : ""}`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.dot }} aria-hidden />
      {prefs.statusLanguage === "plain" ? s.plain : s.medical}
    </span>
  );
}
