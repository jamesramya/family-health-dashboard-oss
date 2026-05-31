import { useState } from "react";
import { Card, Btn, SettingsRow } from "@/components/ui";
import { UserManagement } from "@/components/UserManagement";
import { useAuth } from "@/lib/auth-context";
import { usePatients } from "@/hooks/use-admin";
import { useShareLinks, useCreateShareLink, useRevokeShareLink } from "@/hooks/use-share-links";
import { formatDate } from "@/lib/format";

const EXPIRY_OPTIONS: { label: string; value: number | null }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
  { label: "Never", value: null },
];

function DoctorShareCard() {
  const { data: patientsData } = usePatients();
  const { data: linksData } = useShareLinks();
  const createLink = useCreateShareLink();
  const revokeLink = useRevokeShareLink();

  const patients = patientsData?.patients ?? [];
  const links = linksData?.links ?? [];

  const [showForm, setShowForm] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [expiryDays, setExpiryDays] = useState<number | null>(7);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const defaultPatientId = patients[0]?.id ?? "";
  const effectivePatientId = selectedPatientId || defaultPatientId;

  function handleGenerate() {
    if (!effectivePatientId) return;
    createLink.mutate(
      { patient_ids: [effectivePatientId], expires_in_days: expiryDays },
      {
        onSuccess: (data) => {
          setGeneratedLink(`${window.location.origin}${data.link}`);
          setShowForm(false);
        },
      }
    );
  }

  function handleCopy() {
    if (!generatedLink) return;
    void navigator.clipboard.writeText(generatedLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Card className="space-y-4">
      <SettingsRow
        title="Share with doctor"
        desc="Generate a time-limited read-only link for any person's record."
        action={
          <Btn variant="secondary" size="sm" onClick={() => { setShowForm((v) => !v); setGeneratedLink(null); }}>
            New link
          </Btn>
        }
      />

      {showForm && (
        <div className="space-y-3 pt-2 border-t border-cream-200">
          {patients.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">Patient</label>
              <select
                className="w-full rounded-lg border border-cream-300 px-3 py-2 text-sm text-ink bg-white"
                value={effectivePatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
              >
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1">Link expires in</label>
            <div className="flex gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExpiryDays(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    expiryDays === opt.value
                      ? "bg-teal-500 text-white"
                      : "bg-cream-100 text-ink-soft hover:bg-cream-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <Btn
            variant="primary"
            size="sm"
            onClick={handleGenerate}
            disabled={createLink.isPending || !effectivePatientId}
          >
            {createLink.isPending ? "Generating…" : "Generate"}
          </Btn>
        </div>
      )}

      {generatedLink && (
        <div className="flex items-center gap-2 p-3 bg-cream-50 border border-cream-200 rounded-xl">
          <span className="flex-1 text-sm text-ink-soft truncate font-mono">{generatedLink}</span>
          <Btn variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? "Copied!" : "Copy"}
          </Btn>
        </div>
      )}

      {links.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-cream-200">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">Active links</p>
          {links.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-ink-soft">
                {link.expires_at ? `Expires ${formatDate(link.expires_at)}` : "Never expires"}
              </span>
              <div className="flex items-center gap-2">
                {link.link && (
                  <Btn
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}${link.link}`).then(() => {
                        setCopiedLinkId(link.id);
                        setTimeout(() => setCopiedLinkId(null), 2000);
                      });
                    }}
                  >
                    {copiedLinkId === link.id ? "Copied!" : "Copy"}
                  </Btn>
                )}
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeLink.mutate(link.id)}
                  disabled={revokeLink.isPending}
                  className="text-rose-500 hover:text-rose-600"
                >
                  Revoke
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function Privacy() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Privacy & sharing</h2>
          <p className="text-sm text-ink-muted">Control who can access your family's health data.</p>
        </div>
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-ink">Members</h3>
          <UserManagement />
        </div>
      </Card>

      <DoctorShareCard />

      <Card className="space-y-4">
        <SettingsRow
          title="Emergency access"
          desc="Designate a trusted contact who can unlock the vault if you're unable."
          action={
            <Btn variant="secondary" size="sm" disabled>
              Set up
            </Btn>
          }
        />
      </Card>
    </div>
  );
}
