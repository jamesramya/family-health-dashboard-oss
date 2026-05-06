import { useMemo } from "react";
import { Calendar } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PersonStatusPill } from "@/components/ui/StatusPill";
import { Card } from "@/components/ui/Card";
import { AttentionStrip } from "./AttentionStrip";
import { statusForValue, STATUS_MAP, personStatusFromAlerts } from "@/lib/status";
import { formatRelativeTime } from "@/lib/format";
import type { BloodWorkAlert, Patient } from "@/types/api";

interface DashboardHeroProps {
  patient: Patient;
  alerts: BloodWorkAlert[];
  statusNote: string;
  lastActivity?: string | null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

function todayEyebrow(now = new Date()): string {
  const month = now.toLocaleString("en-US", { month: "short" });
  return `Today · ${month} ${now.getDate()}`;
}

export function DashboardHero({ patient, alerts, statusNote, lastActivity }: DashboardHeroProps) {
  const personStatus = useMemo(() => {
    const tones = alerts.map((a) => {
      const s = statusForValue(a.value, a.ref_low_at_test ?? null, a.ref_high_at_test ?? null);
      return { tone: STATUS_MAP[s].tone };
    });
    return personStatusFromAlerts(tones);
  }, [alerts]);

  return (
    <Card className="bg-white">
      <div className="flex flex-col md:flex-row md:items-start md:gap-6 gap-5">
        <div className="flex items-center gap-4 md:items-start">
          <Avatar initials={initialsOf(patient.name)} tone="#2f6b5f" size={72} />
        </div>
        <div className="flex-1 min-w-0">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {todayEyebrow()}
            </p>
            <h1 className="font-serif text-[40px] md:text-[48px] leading-[1.05] text-ink mt-1">
              How {firstName(patient.name)} is doing
            </h1>
            <p className="text-base text-ink-soft mt-3 max-w-prose">{statusNote}</p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <PersonStatusPill status={personStatus} />
              {lastActivity && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs bg-cream-100 text-ink-muted border border-cream-200">
                  <Calendar size={12} aria-hidden />
                  Last update {formatRelativeTime(lastActivity)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-cream-200">
        <AttentionStrip alerts={alerts} />
      </div>
    </Card>
  );
}
