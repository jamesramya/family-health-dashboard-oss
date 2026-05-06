import { useCultures } from "@/hooks/use-cultures";
import type { CultureResult } from "@/types/api";
import { formatDate } from "@/lib/format";
import { CULTURE_SPECIMEN_LABELS, CULTURE_STATUS_BADGE } from "@/lib/cultures";
import { Spinner } from "@/components/ui/Spinner";

interface CulturesTabProps {
  patientId: string;
}

function CultureCard({ culture }: { culture: CultureResult }) {
  const badge = CULTURE_STATUS_BADGE[culture.result_status] ?? CULTURE_STATUS_BADGE.positive;
  return (
    <div
      data-testid={`culture-card-${culture.id}`}
      className="bg-cream-50 rounded-2xl border border-cream-300 p-4 space-y-3 shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {CULTURE_SPECIMEN_LABELS[culture.specimen_type] ?? "Culture"}
          </p>
          {culture.collection_date && (
            <p className="text-xs text-ink-muted mt-0.5">{formatDate(culture.collection_date)}</p>
          )}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.classes}`}>
          {badge.label}
        </span>
      </div>

      {culture.organism && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">
            Organism
          </p>
          <p className="text-sm text-ink italic">
            {culture.organism}
            {culture.growth_quantity && (
              <span className="not-italic text-xs text-ink-muted ml-2">
                ({culture.growth_quantity} growth)
              </span>
            )}
          </p>
        </div>
      )}

      {culture.sensitivities.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-2">
            Antibiotic Sensitivity
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {culture.sensitivities.map((s) => (
              <div key={s.antibiotic} className="bg-cream-100 rounded-lg px-2 py-1.5 flex items-center gap-2">
                <span
                  data-testid={`sens-dot-${s.antibiotic}`}
                  className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                    s.result === "S" ? "bg-sage-500" :
                    s.result === "R" ? "bg-rose-500" :
                    "bg-amber-400"
                  }`}
                  aria-hidden
                />
                <div>
                  <p className="text-xs text-ink-muted leading-tight">{s.antibiotic}</p>
                  <p className="text-sm text-ink font-medium">{s.result}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {culture.comments && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">
            Lab Comment
          </p>
          <div className="border-l-2 border-teal-400 pl-3">
            <p className="text-xs text-ink-soft leading-relaxed">{culture.comments}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function CulturesTab({ patientId }: CulturesTabProps) {
  const { data, isLoading, error, refetch } = useCultures(patientId);
  const cultures = data?.cultures ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-cream-100 border border-cream-300 rounded-2xl p-4">
        <p className="text-ink text-sm font-medium">Failed to load culture results.</p>
        <button
          onClick={() => void refetch()}
          className="mt-2 text-sm text-teal-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (cultures.length === 0) {
    return (
      <p className="text-center py-16 text-ink-muted text-sm">
        No culture results yet. Upload a culture report to get started.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {cultures.map((c) => (
        <CultureCard key={c.id} culture={c} />
      ))}
    </div>
  );
}
