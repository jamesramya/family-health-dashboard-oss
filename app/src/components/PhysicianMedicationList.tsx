import type { SharedMedication } from "@/hooks/use-shared-record";
import { formatDate } from "@/lib/format";

interface Props { medications: SharedMedication[] }

function PrnRail({ meds }: { meds: SharedMedication[] }) {
  if (meds.length === 0) return null;
  return (
    <div className="rounded-2xl bg-amber-50/60 border border-amber-100 px-5 py-4 space-y-2">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">As needed</p>
      <ul className="space-y-1.5">
        {meds.map((m) => (
          <li key={m.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-ink">{m.brand_name}</span>
            <span className="text-xs text-ink-muted">{m.dosage}</span>
            {m.reason && <span className="text-xs text-ink-soft italic">{m.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActiveCard({ m }: { m: SharedMedication }) {
  const dateLabel = m.end_date
    ? `${formatDate(m.start_date)} – ${formatDate(m.end_date)}`
    : `Since ${formatDate(m.start_date)}`;

  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-4 space-y-2">
      <div>
        <p className="text-sm font-semibold text-ink">{m.brand_name}</p>
        {m.generic_name && <p className="text-xs text-ink-muted">{m.generic_name}</p>}
      </div>
      <p className="text-sm text-ink-soft">
        {m.dosage}
        {m.form && <span className="text-xs text-ink-faint ml-1">({m.form})</span>}
      </p>
      {m.prescribing_doctor && (
        <p className="text-xs text-ink-muted">Prescribed by Dr. {m.prescribing_doctor}</p>
      )}
      <p className="text-xs font-mono text-ink-muted">{dateLabel}</p>
      {m.schedules.length > 0 && (
        <ul className="space-y-0.5">
          {m.schedules.map((s, i) => (
            <li key={i} className="text-xs font-mono text-ink-soft">
              {s.time_of_day.replace(/_/g, " ")}
              {s.dose_quantity ? ` · ${s.dose_quantity}` : ""}
              {" · "}
              {s.meal_relation.replace(/_/g, " ")}
            </li>
          ))}
        </ul>
      )}
      {m.reason && <p className="text-xs text-ink-soft italic">{m.reason}</p>}
      {m.notes && <p className="text-xs text-ink-muted">{m.notes}</p>}
    </div>
  );
}

function PastCard({ m }: { m: SharedMedication }) {
  const dateLabel = m.end_date
    ? `${formatDate(m.start_date)} – ${formatDate(m.end_date)}`
    : `Since ${formatDate(m.start_date)}`;
  return (
    <div className="rounded-2xl border border-cream-200 bg-white p-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="text-sm font-semibold text-ink">{m.brand_name}</span>
      <span className="text-xs text-ink-muted">{m.dosage}</span>
      <span className="text-xs font-mono text-ink-faint">{dateLabel}</span>
    </div>
  );
}

export function PhysicianMedicationList({ medications }: Props) {
  const prn = medications.filter(
    (m) => m.is_active === 1 && m.schedules.some((s) => s.time_of_day === "as_needed"),
  );
  const scheduled = medications.filter(
    (m) => m.is_active === 1 && !m.schedules.every((s) => s.time_of_day === "as_needed"),
  );
  const past = medications.filter((m) => m.is_active !== 1);

  return (
    <div className="space-y-6">
      <PrnRail meds={prn} />
      <section>
        <h3 className="text-sm font-semibold text-ink-soft mb-2">
          Active medications · {scheduled.length}
        </h3>
        {scheduled.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <div className="space-y-2">
            {scheduled.map((m) => <ActiveCard key={m.id} m={m} />)}
          </div>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-ink-soft mb-2">
          Past medications · {past.length}
        </h3>
        {past.length === 0 ? (
          <p className="text-sm text-ink-muted">None.</p>
        ) : (
          <div className="space-y-2">
            {past.map((m) => <PastCard key={m.id} m={m} />)}
          </div>
        )}
      </section>
    </div>
  );
}
