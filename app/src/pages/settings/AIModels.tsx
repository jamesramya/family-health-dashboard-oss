import { useState } from "react";
import { ChevronDown, Eye, EyeOff, Mic } from "lucide-react";
import { Btn, Card, Toggle } from "@/components/ui";
import {
  useAIProviders,
  useUpdateAIProvider,
  useDeleteAIProvider,
  useAIUseCases,
  useUpdateAIUseCase,
  useAIGateway,
  useUpdateAIGateway,
} from "@/hooks/use-ai-config";
import { AI_PROVIDERS, AI_USE_CASES, PROVIDER_ICONS, CLOUDFLARE_ICON_PATH } from "@/lib/ai-settings";

// ─── Provider row ─────────────────────────────────────────────────────────────

interface ProviderRowProps {
  providerId: string;
  name: string;
  logoTone: string;
  models: string[];
  hasKey: boolean;
  source: "d1" | "env" | null;
  storedModel: string | null;
}

function ProviderRow({ providerId, name, logoTone, models, hasKey, source, storedModel }: ProviderRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [key, setKey] = useState("");
  const [reveal, setReveal] = useState(false);
  const [selectedModel, setSelectedModel] = useState(storedModel ?? models[0]);
  const [overriding, setOverriding] = useState(false);

  const update = useUpdateAIProvider(providerId);
  const remove = useDeleteAIProvider(providerId);

  const inputCls =
    "w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white text-[13px] font-mono text-ink outline-none focus:border-teal-500 min-h-[44px]";

  function handleSave() {
    if (!key.trim()) return;
    update.mutate({ api_key: key.trim(), model: selectedModel });
    setKey("");
    setExpanded(false);
    setOverriding(false);
  }

  function handleRemove() {
    remove.mutate();
    setExpanded(false);
    setOverriding(false);
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center"
          style={{ background: logoTone }}
          aria-hidden="true"
        >
          {PROVIDER_ICONS[providerId] ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d={PROVIDER_ICONS[providerId]} />
            </svg>
          ) : (
            <span className="font-semibold text-white text-sm">{name[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-ink">{name}</p>
            {hasKey && source === "d1" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 text-sage-600 border border-sage-200 px-2 py-0.5 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-sage-500" />
                Key saved
              </span>
            ) : hasKey && source === "env" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Env var
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 text-ink-muted px-2 py-0.5 text-xs font-medium">
                Not configured
              </span>
            )}
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            {hasKey && source === "d1" && storedModel
              ? <>Default model <span className="font-mono text-ink-soft">{storedModel}</span></>
              : hasKey && source === "env"
              ? "Configured via environment variable"
              : <>{models.length} models available</>}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {source === "env" && !overriding && (
            <Btn variant="secondary" size="sm" onClick={() => setOverriding(true)}>
              Override
            </Btn>
          )}
          {source !== "env" && (
            <>
              {hasKey && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-sm text-rose-500 hover:underline"
                >
                  Remove
                </button>
              )}
              <Btn
                variant={hasKey ? "secondary" : "primary"}
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                {hasKey ? "Rotate key" : "Add key"}
              </Btn>
            </>
          )}
        </div>
      </div>

      {((source !== "env" && expanded) || (source === "env" && overriding)) && (
        <div className="mt-4 ml-14 p-4 rounded-xl bg-cream-50 border border-cream-200 space-y-3">
          {source === "env" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Saving will override the environment variable for this provider. Removing the saved key reverts to the environment variable.
            </p>
          )}
          <div>
            <label
              htmlFor={`key-${providerId}`}
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
            >
              API key
            </label>
            <div className="flex items-center gap-2 mt-1">
              <input
                id={`key-${providerId}`}
                type={reveal ? "text" : "password"}
                autoFocus
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={providerId === "anthropic" ? "sk-ant-…" : providerId === "openai" ? "sk-…" : "Paste provider key"}
                className={inputCls}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="w-10 h-10 grid place-items-center rounded-xl bg-cream-100 text-ink-soft flex-shrink-0"
                aria-label={reveal ? `Hide ${name} key` : `Show ${name} key`}
              >
                {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label
              htmlFor={`model-${providerId}`}
              className="text-xs font-semibold uppercase tracking-wider text-ink-muted"
            >
              Default model
            </label>
            <select
              id={`model-${providerId}`}
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full mt-1 bg-white border border-cream-200 rounded-xl px-4 py-2.5 text-sm font-mono min-h-[44px]"
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn variant="ghost" size="sm" onClick={() => { setExpanded(false); setOverriding(false); }}>Cancel</Btn>
            <Btn
              variant="primary"
              size="sm"
              onClick={handleSave}
              className={key.trim().length > 3 ? "" : "opacity-40 pointer-events-none"}
            >
              Save key
            </Btn>
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Use-case routing row ─────────────────────────────────────────────────────

interface UseCaseRowProps {
  useCaseId: string;
  label: string;
  description: string;
  currentProvider: string;
  currentModel: string;
}

function UseCaseRow({ useCaseId, label, description, currentProvider, currentModel }: UseCaseRowProps) {
  const update = useUpdateAIUseCase(useCaseId);

  const prov = AI_PROVIDERS.find((p) => p.id === currentProvider);

  function handleProviderChange(pid: string) {
    const p = AI_PROVIDERS.find((x) => x.id === pid);
    update.mutate({ provider: pid, model: p?.models[0] ?? "" });
  }

  function handleModelChange(model: string) {
    update.mutate({ provider: currentProvider, model });
  }

  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{label}</p>
          <p className="text-sm text-ink-muted mt-0.5">{description}</p>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          <div className="relative">
            <select
              value={currentProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="appearance-none border border-cream-300 rounded-full pl-3 pr-7 py-1.5 text-sm bg-white h-9"
              aria-label={`Provider for ${label}`}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft" />
          </div>
          <div className="relative">
            <select
              value={currentModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="appearance-none border border-cream-300 rounded-full pl-3 pr-7 py-1.5 text-sm bg-white h-9 font-mono"
              aria-label={`Model for ${label}`}
            >
              {(prov?.models ?? [currentModel]).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft" />
          </div>
        </div>
      </div>
    </li>
  );
}

// ─── Gateway card ─────────────────────────────────────────────────────────────

interface GatewayFormProps {
  initial: { account_id: string | null; gateway_id: string | null; source: "d1" | "env" | null };
}

function GatewayForm({ initial }: GatewayFormProps) {
  const update = useUpdateAIGateway();
  const [accountId, setAccountId] = useState(initial.account_id ?? "");
  const [gatewayId, setGatewayId] = useState(initial.gateway_id ?? "family-health");
  const [saved, setSaved] = useState(false);
  const [overriding, setOverriding] = useState(false);

  const isConnected = Boolean(initial.account_id);

  const inputCls =
    "w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white text-[14px] font-mono text-ink outline-none focus:border-teal-500 min-h-[44px]";

  function handleSave() {
    if (!accountId.trim() || !gatewayId.trim()) return;
    update.mutate(
      { account_id: accountId.trim(), gateway_id: gatewayId.trim() },
      {
        onSuccess: () => {
          setSaved(true);
          setOverriding(false);
          setTimeout(() => setSaved(false), 1800);
        },
      },
    );
  }

  if (initial.source === "env" && !overriding) {
    return (
      <Card>
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#f6821f]/10 text-[#f6821f] flex items-center justify-center flex-shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d={CLOUDFLARE_ICON_PATH} />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="font-sans font-semibold text-ink">Cloudflare AI Gateway</h3>
            <p className="text-sm text-ink-muted mt-0.5">Configured via environment variable.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Env var
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Cloudflare account ID</p>
            <p className="px-3 py-2.5 rounded-xl border border-cream-200 bg-cream-50 text-[14px] font-mono text-ink-soft min-h-[44px] flex items-center">
              {initial.account_id}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Gateway ID</p>
            <p className="px-3 py-2.5 rounded-xl border border-cream-200 bg-cream-50 text-[14px] font-mono text-ink-soft min-h-[44px] flex items-center">
              {initial.gateway_id}
            </p>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Btn variant="secondary" size="sm" onClick={() => setOverriding(true)}>
            Override
          </Btn>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl bg-[#f6821f]/10 text-[#f6821f] flex items-center justify-center flex-shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.3 14.2c.3-.8 0-1.5-.7-1.6l-5.6-.1c-.1 0-.2-.1-.2-.2v-.1l1-2.4c.5-1.4-.4-3-1.9-3.1a6 6 0 0 0-5.7 4c0 .1 0 .2.2.2h1.5c.8 0 1.2.7.9 1.4-.3.7 0 1.5.7 1.5h9.6c.1 0 .2 0 .2-.2zM18.3 11.3h-.6a.1.1 0 0 0-.1.1l-.1.5c-.2.6.2 1.2.7 1.3h.4c.4.1.6.6.5 1-.1.2-.3.4-.5.4h-5.2c-.1 0-.2.1-.2.2l-.2.9a.2.2 0 0 0 .2.2h5.4a2.8 2.8 0 0 0 .1-5.6z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="font-sans font-semibold text-ink">Cloudflare AI Gateway</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            Every model call is routed through your Gateway for caching, rate-limits, and a unified audit log.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${isConnected ? "bg-sage-50 text-sage-600 border border-sage-200" : "bg-cream-200 text-ink-muted"}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: isConnected ? "#6b9f58" : "#a39d8f" }}
          />
          {isConnected ? "Connected" : "Not set"}
        </span>
      </div>

      {initial.source === "env" && (
        <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Saving will override the AI_GATEWAY_URL environment variable.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
        <div>
          <label htmlFor="gateway-account-id" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint block mb-1">
            Cloudflare account ID
          </label>
          <input
            id="gateway-account-id"
            className={inputCls}
            placeholder="a1b2c3d4e5f6…"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="gateway-id" className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint block mb-1">
            Gateway ID
          </label>
          <input
            id="gateway-id"
            className={inputCls}
            placeholder="family-health"
            value={gatewayId}
            onChange={(e) => setGatewayId(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-xs text-ink-faint">
          Keys are encrypted with HKDF + AES-GCM before storage.
        </p>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-sage-600">Saved.</span>}
          {overriding && (
            <Btn variant="ghost" size="sm" onClick={() => setOverriding(false)}>Cancel</Btn>
          )}
          <Btn variant="secondary" size="sm" onClick={handleSave}>
            Save gateway
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function GatewayCard() {
  const { data, isLoading } = useAIGateway();
  if (isLoading || !data) return null;
  return <GatewayForm initial={data} />;
}

// ─── Voice Notes sub-card ─────────────────────────────────────────────────────

interface SettingsRowProps {
  title: string;
  description: string;
  action: React.ReactNode;
}

function SettingsRow({ title, description, action }: SettingsRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{title}</p>
        <p className="text-sm text-ink-muted mt-0.5">{description}</p>
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}

function VoiceNotesCard() {
  const [transcribe, setTranscribe] = useState(true);
  const [format, setFormat] = useState(true);
  const [keepAudio, setKeepAudio] = useState(true);
  const [language, setLanguage] = useState("auto");

  return (
    <Card>
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center flex-shrink-0">
          <Mic size={22} />
        </div>
        <div className="flex-1">
          <h3 className="font-sans font-semibold text-ink">Voice notes</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            Record audio directly inside notes (capped at 2 minutes per clip). Transcription uses the Voice transcription provider configured above.
          </p>
        </div>
      </div>

      <SettingsRow
        title="Transcribe voice notes"
        description="Runs the recording through the voice transcription provider to produce text."
        action={<Toggle on={transcribe} onChange={setTranscribe} label="Transcribe voice notes" />}
      />
      <SettingsRow
        title="Auto-format transcript"
        description="Clean up filler words, add punctuation and paragraph breaks."
        action={<Toggle on={format} onChange={setFormat} label="Auto-format transcript" />}
      />
      <SettingsRow
        title="Keep original audio"
        description="Attach the .webm clip to the note so you can play it back later."
        action={<Toggle on={keepAudio} onChange={setKeepAudio} label="Keep original audio" />}
      />
      <SettingsRow
        title="Recording language"
        description="Biases the transcription model."
        action={
        <div className="relative">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="appearance-none border border-cream-300 rounded-full pl-3 pr-7 py-1.5 text-sm bg-white h-9"
          >
            <option value="auto">Auto-detect</option>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
            <option value="hi">Hindi</option>
            <option value="en-ta">English + Tamil</option>
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-soft" />
        </div>
        }
      />
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIModels() {
  const { data: providersData, isLoading: loadingProviders } = useAIProviders();
  const { data: useCasesData, isLoading: loadingUseCases } = useAIUseCases();

  const storedMap = new Map(
    (providersData?.providers ?? []).map((p) => [p.provider, p]),
  );

  const useCaseMap = new Map(
    (useCasesData?.use_cases ?? []).map((u) => [u.use_case, u]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">AI models</h2>
        <p className="text-sm text-ink-muted mt-1">
          Configure Cloudflare AI Gateway, provider keys, and routing for each AI task.
        </p>
      </div>

      {/* Cloudflare AI Gateway */}
      <GatewayCard />

      {/* Providers & keys */}
      <Card padded={false}>
        <div className="p-5 border-b border-cream-200">
          <h3 className="font-sans font-semibold text-ink">Providers &amp; keys</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            {loadingProviders
              ? "Loading…"
              : `${(providersData?.providers ?? []).filter((p) => p.has_key).length} of ${AI_PROVIDERS.length} providers configured.`}
          </p>
        </div>
        <ul className="divide-y divide-cream-200">
          {AI_PROVIDERS.map((p) => {
            const stored = storedMap.get(p.id);
            return (
              <ProviderRow
                key={p.id}
                providerId={p.id}
                name={p.name}
                logoTone={p.logoTone}
                models={p.models}
                hasKey={stored?.has_key ?? false}
                source={stored?.source ?? null}
                storedModel={stored?.model ?? null}
              />
            );
          })}
        </ul>
      </Card>

      {/* Use-case routing */}
      <Card padded={false}>
        <div className="p-5 border-b border-cream-200">
          <h3 className="font-sans font-semibold text-ink">Where each model is used</h3>
          <p className="text-sm text-ink-muted mt-0.5">
            Pick which configured provider handles each AI task.
          </p>
        </div>
        <ul className="divide-y divide-cream-200">
          {AI_USE_CASES.map((uc) => {
            const current = useCaseMap.get(uc.id);
            return (
              <UseCaseRow
                key={uc.id}
                useCaseId={uc.id}
                label={uc.label}
                description={uc.description}
                currentProvider={current?.provider ?? "google"}
                currentModel={current?.model ?? ""}
              />
            );
          })}
        </ul>
      </Card>

      {/* Voice notes */}
      {!loadingUseCases && <VoiceNotesCard />}
    </div>
  );
}
