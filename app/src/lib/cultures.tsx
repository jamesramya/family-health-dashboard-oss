import type { AntibioticSensitivity } from "@/types/api";

export const CULTURE_SPECIMEN_LABELS: Record<string, string> = {
  blood: "Blood Culture",
  urine: "Urine Culture",
  sputum: "Sputum Culture",
  other: "Culture",
};

export const CULTURE_STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  positive:    { label: "Positive",     classes: "bg-red-100 text-red-700" },
  negative:    { label: "Negative",     classes: "bg-green-100 text-green-700" },
  no_growth:   { label: "No Growth",    classes: "bg-green-100 text-green-700" },
  contaminated:{ label: "Contaminated", classes: "bg-amber-100 text-amber-700" },
};

export const CULTURE_SIR_CLASSES: Record<string, string> = {
  S: "text-green-700 font-bold",
  I: "text-amber-600 font-bold",
  R: "text-red-600 font-bold",
};

export function SensitivityGrid({ sensitivities }: { sensitivities: AntibioticSensitivity[] }) {
  if (sensitivities.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">
        Antibiotic Sensitivity
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {sensitivities.map((s) => (
          <div key={s.antibiotic} className="bg-cream-50 rounded-lg px-2 py-1.5">
            <p className="text-xs text-ink-faint leading-tight">{s.antibiotic}</p>
            <p className={`text-sm ${CULTURE_SIR_CLASSES[s.result] ?? "text-ink-soft font-bold"}`}>
              {s.result}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
