import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useDashboard } from "@/hooks/use-dashboard";
import { useMedications } from "@/hooks/use-medications";
import { useDocuments } from "@/hooks/use-documents";
import { useDefaultPatientId } from "@/hooks/use-admin";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Skeleton } from "@/components/ui/Skeleton";
import { buildStatusNote } from "@/lib/buildStatusNote";
import { DashboardHero } from "@/components/dashboard/DashboardHero";
import { MiniPillbox } from "@/components/dashboard/MiniPillbox";
import { buildMiniMeds, type MiniMed } from "@/lib/dashboard-meds";
import { RecentVitalsStrip } from "@/components/dashboard/RecentVitalsStrip";
import { RecentTimeline } from "@/components/dashboard/RecentTimeline";

function CardHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">{eyebrow}</p>
        <h3 className="font-sans text-lg font-semibold tracking-[-0.01em] text-ink mt-0.5">{title}</h3>
      </div>
      {action}
    </div>
  );
}

export function Dashboard() {
  const { patientId, isLoading: patientLoading } = useDefaultPatientId();
  const { data: summary, isLoading: loadingSummary, error, refetch } =
    useDashboard(patientId ?? "");
  const { data: medsData } = useMedications(patientId ?? "");
  const { data: docsData } = useDocuments(patientId ?? "", { limit: 6 });

  const miniMeds: MiniMed[] = useMemo(
    () => buildMiniMeds(medsData?.medications ?? []),
    [medsData]
  );

  if (patientLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!patientId) {
    return <p className="text-center py-16 text-ink-muted">No patient found. Please complete setup first.</p>;
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <p className="text-rose-500 font-medium">Failed to load dashboard.</p>
        <button
          onClick={() => void refetch()}
          className="mt-3 text-sm text-teal-600 hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadingSummary || !summary ? (
        <Skeleton className="h-60" />
      ) : (
        <DashboardHero
          patient={summary.patient}
          alerts={summary.blood_work_alerts}
          statusNote={buildStatusNote(summary.active_medications_count, summary.blood_work_alerts.length)}
          lastActivity={summary.last_activity}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeading
            eyebrow="Today"
            title="Medications"
            action={<Link to="/medications" className="text-sm text-teal-600 hover:underline">Manage →</Link>}
          />
          <MiniPillbox meds={miniMeds} />
        </Card>

        <Card>
          <CardHeading
            eyebrow="Latest"
            title="Vitals"
            action={<Link to="/vitals" className="text-sm text-teal-600 hover:underline">View →</Link>}
          />
          <RecentVitalsStrip readings={summary?.latest_vitals ?? []} />
        </Card>
      </div>

      <div>
        <SectionHeader eyebrow="Timeline" title="Recently" subtitle="Everything that's happened with this person's records" />
        <Card padded={false}>
          <RecentTimeline documents={docsData?.documents ?? []} />
        </Card>
      </div>
    </div>
  );
}
