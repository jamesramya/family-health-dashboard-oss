import { useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { Card, Btn } from "@/components/ui";
import { AppMarkInline, getPresetByName, APP_PRESETS } from "@/components/AppMark";
import { useConfirm } from "@/hooks/use-confirm";
import { usePatients } from "@/hooks/use-admin";
import {
  useOAuthClients,
  useRevokeOAuthClient,
  useAccessLog,
  type OAuthClientItem,
  type OAuthAccessLogEntry,
} from "@/hooks/use-tokens";
import { formatDate, formatRelativeTime, formatLogTime } from "@/lib/format";

// ---- PHI ribbon ----

interface PhiDisclosureRibbonProps {
  show: boolean;
}

function PhiDisclosureRibbon({ show }: PhiDisclosureRibbonProps) {
  if (!show) return null;
  return (
    <aside
      role="complementary"
      aria-label="PHI flow reminder"
      className="flex items-start gap-3 px-5 py-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm text-amber-800"
    >
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" aria-hidden="true" />
      <p>
        Connected apps can read your family's health data through MCP. Review the access log below
        to see what has been accessed.
      </p>
    </aside>
  );
}

// ---- Scope chips ----

function ScopeChips({ scopes }: { scopes: string }) {
  const tokens = scopes
    .split(/\s+/)
    .filter(Boolean)
    .map((s) => s.replace(/^mcp\./, ""));

  return (
    <span className="inline-flex gap-1 flex-wrap">
      {tokens.map((token) => (
        <span
          key={token}
          className={`text-xs px-2 py-0.5 rounded-full border ${
            token === "write"
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-sage-50 text-sage-700 border-sage-200"
          }`}
        >
          {token}
        </span>
      ))}
    </span>
  );
}

// ---- Authorized apps ----

interface AuthorizedAppsCardProps {
  clients: OAuthClientItem[];
}

function AuthorizedAppsCard({ clients }: AuthorizedAppsCardProps) {
  const confirm = useConfirm();
  const revokeClient = useRevokeOAuthClient();

  async function handleRevoke(client: OAuthClientItem) {
    const ok = await confirm({
      title: `Disconnect "${client.client_name}"?`,
      message: "This will revoke access immediately. The app will need to reconnect.",
      confirmLabel: "Revoke",
      destructive: true,
    });
    if (!ok) return;
    revokeClient.mutate(client.id);
  }

  return (
    <Card padded={false}>
      <div className="px-5 py-4">
        <h2 className="text-base font-semibold text-ink">Authorized apps</h2>
        <p className="text-xs text-ink-muted">Apps connected via OAuth.</p>
      </div>
      <ul className="divide-y divide-cream-100 border-t border-cream-200">
        {clients.map((client) => {
          const preset = getPresetByName(client.client_name);
          return (
            <li key={client.id} className="flex items-center gap-4 px-5 py-3">
              <AppMarkInline preset={preset} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-ink">{client.client_name}</p>
                  <ScopeChips scopes={client.scopes} />
                </div>
                <p className="text-xs text-ink-muted mt-0.5">
                  Connected {formatDate(client.created_at)}
                  {client.last_used_at
                    ? ` · Last used ${formatRelativeTime(client.last_used_at)}`
                    : " · Never used"}
                </p>
              </div>
              <Btn
                variant="ghost"
                size="sm"
                onClick={() => void handleRevoke(client)}
                disabled={revokeClient.isPending}
                className="text-rose-500 flex-shrink-0"
              >
                Revoke
              </Btn>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---- Setup steps per client ----

const SETUP_STEPS: Record<string, { title: string; steps: string[] }> = {
  "claude-desktop": {
    title: "Claude Desktop",
    steps: [
      'Open Settings → Developer → Edit Config',
      `Add an MCP server with URL set to your MCP endpoint`,
      'Restart Claude Desktop',
      'Sign in when prompted — approval is one-click',
    ],
  },
  "claude-web": {
    title: "Claude (Web)",
    steps: [
      'Go to Claude.ai → Integrations (beta)',
      `Add a new integration and paste the MCP URL`,
      'Authorise when prompted',
    ],
  },
  "chatgpt": {
    title: "ChatGPT",
    steps: [
      'Go to ChatGPT → Explore GPTs → Create',
      'Under Actions, add a new action',
      `Import from URL using your OpenAPI spec URL`,
      'Set auth to OAuth and follow the flow',
    ],
  },
  "cursor": {
    title: "Cursor",
    steps: [
      'Open Cursor Settings → MCP',
      `Add a new server with the MCP URL`,
      'Reload Cursor window',
    ],
  },
  "zed": {
    title: "Zed",
    steps: [
      'Open your Zed settings.json',
      `Add an entry under "context_servers" with the MCP URL`,
      'Restart Zed',
    ],
  },
  "cline": {
    title: "Cline",
    steps: [
      'Open VS Code settings for Cline',
      `Add an MCP server entry with the MCP URL`,
      'Run "Cline: Reload MCP Servers"',
    ],
  },
  "mcp-inspector": {
    title: "MCP Inspector",
    steps: [
      `Run: npx @modelcontextprotocol/inspector`,
      `Enter the MCP URL in the server field`,
      'Connect and authorise',
    ],
  },
};

// ---- Connect via MCP card ----

function ConnectViaMcpCard() {
  const mcpUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/mcp`;
  const [copied, setCopied] = useState(false);
  const [activeClient, setActiveClient] = useState<string | null>(null);

  function handleCopy() {
    void navigator.clipboard.writeText(mcpUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  const presetKeys = Object.keys(APP_PRESETS);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-ink">Connect via MCP</h2>
        <p className="text-xs text-ink-muted mt-0.5">
          Use the Model Context Protocol to connect any compatible AI client.
        </p>
      </div>

      <div className="flex items-center gap-2 p-3 bg-cream-50 border border-cream-200 rounded-xl">
        <code className="flex-1 text-xs text-ink-soft break-all font-mono">{mcpUrl}</code>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy MCP URL"
          className="flex-shrink-0 p-2 rounded-lg bg-white border border-cream-200 text-ink-soft hover:bg-cream-100 transition-colors"
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        </button>
      </div>

      <div>
        <p className="text-xs font-semibold text-ink-muted mb-3 uppercase tracking-wide">
          Compatible clients
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {presetKeys.map((key) => {
            const preset = APP_PRESETS[key];
            const isActive = activeClient === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={preset.name}
                onClick={() => setActiveClient(isActive ? null : key)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-colors text-center ${
                  isActive
                    ? "border-teal-400 bg-teal-50"
                    : "border-cream-200 bg-white hover:bg-cream-50"
                }`}
              >
                <AppMarkInline preset={preset} size={32} />
              </button>
            );
          })}
        </div>
      </div>

      {activeClient && SETUP_STEPS[activeClient] && (
        <div className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3 space-y-2">
          <p className="text-sm font-semibold text-ink">
            Setting up {SETUP_STEPS[activeClient].title}
          </p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {SETUP_STEPS[activeClient].steps.map((step, i) => (
              <li key={i} className="text-sm text-ink-soft">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

// ---- Access log ----

const KIND_LABEL: Record<string, string> = {
  read: "Read",
  write: "Write",
  "dry-run": "Dry run",
};

function AccessLogSection() {
  const [filterClient, setFilterClient] = useState("");
  const [filterPatient, setFilterPatient] = useState("");
  const [page, setPage] = useState(0);

  const { data: clients } = useOAuthClients();
  const { data: patientsData } = usePatients();
  const { data: logData, isLoading } = useAccessLog({
    clientId: filterClient || undefined,
    patientId: filterPatient || undefined,
    page,
  });

  const entries: OAuthAccessLogEntry[] = logData?.entries ?? [];
  const pageSize = 50;
  const total = logData?.total ?? 0;
  const hasMore = (page + 1) * pageSize < total;

  function handleClientFilter(v: string) {
    setFilterClient(v);
    setPage(0);
  }
  function handlePatientFilter(v: string) {
    setFilterPatient(v);
    setPage(0);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-ink">Access log</h3>
        <div className="flex gap-2 flex-wrap">
          <select
            value={filterClient}
            onChange={(e) => handleClientFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-full border border-cream-300 bg-white text-ink-soft min-h-[36px]"
            aria-label="Filter by app"
          >
            <option value="">All apps</option>
            {(clients ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.client_name}
              </option>
            ))}
          </select>
          <select
            value={filterPatient}
            onChange={(e) => handlePatientFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-full border border-cream-300 bg-white text-ink-soft min-h-[36px]"
            aria-label="Filter by family member"
          >
            <option value="">All family members</option>
            {(patientsData?.patients ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-ink-muted py-8 text-center">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-ink-muted py-8 text-center">
          No API calls recorded yet. Activity appears here as soon as a connected app accesses your
          data.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-cream-200 shadow-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 bg-cream-50">
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">Time</th>
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">App</th>
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">
                  Family member
                </th>
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">Tool</th>
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">Kind</th>
                <th className="text-left text-xs font-semibold text-ink-muted px-4 py-2">
                  Result
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-2 text-xs text-ink-muted whitespace-nowrap font-mono">
                    {formatLogTime(entry.created_at)}
                  </td>
                  <td className="px-4 py-2 text-xs text-ink">{entry.oauth_client_name}</td>
                  <td className="px-4 py-2 text-xs text-ink-muted">{entry.patient_name ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-ink font-mono">{entry.tool}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.kind === "write"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : entry.kind === "dry-run"
                            ? "bg-cream-100 text-ink-muted"
                            : "bg-sage-50 text-sage-700 border border-sage-200"
                      }`}
                    >
                      {KIND_LABEL[entry.kind] ?? entry.kind}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.status_code >= 200 && entry.status_code < 300
                          ? "bg-sage-50 text-sage-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {entry.status_code}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(page > 0 || hasMore) && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-cream-100">
              <Btn variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Btn>
              <span className="text-xs text-ink-muted">Page {page + 1}</span>
              <Btn variant="ghost" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export function Integrations() {
  const { data: clients, isLoading } = useOAuthClients();
  const activeClients = clients ?? [];

  return (
    <div className="space-y-4">
      <PhiDisclosureRibbon show={!isLoading && activeClients.length > 0} />
      <ConnectViaMcpCard />
      {activeClients.length > 0 && <AuthorizedAppsCard clients={activeClients} />}
      <AccessLogSection />
    </div>
  );
}
