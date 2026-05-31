import { Card } from "@/components/ui";
import { formatDate } from "@/lib/format";

export function About() {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">About</h2>
        <p className="text-sm text-ink-muted">Family Health Dashboard</p>
      </div>
      <div className="space-y-2 text-sm text-ink-soft">
        <p>{`v${__APP_VERSION__} · ${__BUILD_SHA__} · built ${formatDate(__BUILD_DATE__)} · MIT licensed`}</p>
        <a href="https://familyhealth.dev" className="text-teal-600 hover:underline block">familyhealth.dev</a>
        <a href="https://github.com/jamesramya/family-health-dashboard" className="text-teal-600 hover:underline block">Source on GitHub</a>
      </div>
    </Card>
  );
}
