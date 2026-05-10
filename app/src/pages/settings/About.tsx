import { Card } from "@/components/ui";

const BRAND_NAME = import.meta.env.VITE_BRAND_NAME ?? "Family Health Dashboard";
const BRAND_URL = import.meta.env.VITE_BRAND_URL ?? "https://example.com";
const SOURCE_URL = import.meta.env.VITE_SOURCE_URL ?? "https://github.com/your-username/family-health-dashboard-oss";

export function About() {
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">About</h2>
        <p className="text-sm text-ink-muted">{BRAND_NAME}</p>
      </div>
      <div className="space-y-2 text-sm text-ink-soft">
        <p>v1.4.2 · built Apr 2026 · MIT licensed</p>
        <a href={BRAND_URL} className="text-teal-600 hover:underline block">{BRAND_URL}</a>
        <a href={SOURCE_URL} className="text-teal-600 hover:underline block">Source on GitHub</a>
      </div>
    </Card>
  );
}
