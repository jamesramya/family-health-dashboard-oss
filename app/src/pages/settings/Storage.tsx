import { useState } from "react";
import { Card, Btn, SettingsRow } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useStorageUsage, exportData } from "@/hooks/use-storage";

const QUOTA_BYTES = 1073741824; // 1 GB

function bytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function Storage() {
  const { user } = useAuth();
  const { data } = useStorageUsage();
  const [isExporting, setIsExporting] = useState(false);

  if (user?.role !== "admin") return null;

  const totalBytes = data?.total_bytes ?? 0;
  const quotaBytes = data?.quota_bytes ?? QUOTA_BYTES;
  const documents = data?.by_category.documents ?? 0;
  const scans = data?.by_category.scans ?? 0;
  const photos = data?.by_category.photos ?? 0;

  const usedMB = bytesToMB(totalBytes);
  const pct = Math.min((totalBytes / quotaBytes) * 100, 100);

  async function handleExport() {
    setIsExporting(true);
    try {
      await exportData();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Storage & backup</h2>
        <p className="text-sm text-ink-muted">Manage document storage and backup settings.</p>
      </div>

      <Card>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Vault</p>
        <div className="flex items-end gap-3 mb-4">
          <p className="font-sans text-4xl font-semibold tabular-nums text-ink">
            {usedMB}<span className="text-lg text-ink-faint ml-1">MB</span>
          </p>
          <p className="text-sm text-ink-muted mb-1.5">of 1 GB used</p>
        </div>
        <div className="h-2 bg-cream-100 rounded-full overflow-hidden mb-4">
          <div
            data-testid="usage-bar"
            className="h-full bg-teal-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <ul className="text-sm text-ink-soft space-y-1.5">
          {[
            ["Documents", documents] as const,
            ["Scans", scans] as const,
            ["Photos", photos] as const,
          ].map(([label, bytes]) => (
            <li key={label} className="flex justify-between">
              <span>{label}</span>
              <span className="tabular-nums text-ink-faint">{bytesToMB(bytes)} MB</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <SettingsRow
          title="Backup"
          desc="Automatic backup configuration — coming soon."
          action={
            <Btn variant="secondary" size="sm" disabled>
              Coming soon
            </Btn>
          }
        />
        <SettingsRow
          title="Export all data"
          desc="Download a copy of every record as a JSON bundle."
          action={
            <Btn
              variant="secondary"
              size="sm"
              onClick={() => { void handleExport(); }}
              disabled={isExporting}
            >
              {isExporting ? "Exporting…" : "Export"}
            </Btn>
          }
        />
        <SettingsRow
          title="Import from another app"
          desc="Apple Health, CommonHealth, or FHIR bundle — coming soon."
          action={
            <Btn variant="secondary" size="sm" disabled>
              Coming soon
            </Btn>
          }
        />
      </Card>
    </div>
  );
}
