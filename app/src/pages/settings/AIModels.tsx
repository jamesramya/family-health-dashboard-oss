import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Btn, Card } from "@/components/ui";
import { loadAISettings, saveAISettings, USE_CASE_INFO, type AISettings, type Provider } from "@/lib/ai-settings";

const PROVIDERS: Provider[] = ["openai", "anthropic", "google", "deepgram"];
const LABELS: Record<Provider, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google", deepgram: "Deepgram" };

export function AIModels() {
  const [s, setS] = useState<AISettings>(loadAISettings);
  const [reveal, setReveal] = useState<Record<Provider, boolean>>({ openai: false, anthropic: false, google: false, deepgram: false });
  const [saved, setSaved] = useState(false);

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white text-[14px] font-mono text-ink outline-none focus:border-teal-500";
  const labelCls = "text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1";

  function save() {
    saveAISettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">AI models</h2>
        <p className="text-sm text-ink-muted">Cloudflare AI Gateway endpoint + provider keys.</p>
      </div>

      <div>
        <p className={labelCls}>Cloudflare AI Gateway URL</p>
        <input
          className={inputCls}
          placeholder="https://gateway.ai.cloudflare.com/v1/ACCOUNT/GATEWAY"
          value={s.gatewayUrl}
          onChange={(e) => setS({ ...s, gatewayUrl: e.target.value })}
        />
      </div>

      <div className="space-y-3">
        <p className={labelCls}>Provider keys</p>
        {PROVIDERS.map((p) => (
          <div key={p} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-24 text-sm text-ink-soft">{LABELS[p]}</span>
              <input
                type={reveal[p] ? "text" : "password"}
                className={inputCls}
                placeholder="sk-…"
                value={s.keys[p]}
                onChange={(e) => setS({ ...s, keys: { ...s.keys, [p]: e.target.value } })}
                autoComplete="off"
              />
              <button
                onClick={() => setReveal({ ...reveal, [p]: !reveal[p] })}
                className="w-9 h-9 grid place-items-center rounded-xl bg-cream-100 text-ink-soft"
                aria-label={reveal[p] ? `Hide ${p} key` : `Show ${p} key`}
              >
                {reveal[p] ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {s.keys[p] && (
              <div className="ml-24 pl-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 text-xs font-medium">
                  Key saved
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className={labelCls}>Where each model is used</p>
        <div className="space-y-2">
          {Object.entries(USE_CASE_INFO).map(([key, uc]) => (
            <div key={key} className="rounded-xl border border-cream-200 bg-cream-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{uc.label}</p>
                  <p className="text-xs text-ink-muted mt-0.5">{uc.description}</p>
                  {uc.fallbackModel && (
                    <p className="text-[11px] text-ink-faint mt-1">Fallback: {uc.fallbackModel}</p>
                  )}
                  {!uc.fallbackModel && uc.fallbackNote && (
                    <p className="text-[11px] text-ink-faint mt-1">No fallback — {uc.fallbackNote}</p>
                  )}
                </div>
                <span className="font-mono text-[12px] text-teal-700 bg-teal-50 px-2 py-1 rounded-lg flex-shrink-0">{uc.primaryModel}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Btn onClick={save}>Save</Btn>
        {saved && <span className="text-sm text-sage-600">Saved.</span>}
      </div>
    </Card>
  );
}
