import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Pencil, ShieldCheck, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { AppMark, getPresetByName } from "@/components/AppMark";
import { Btn, Card } from "@/components/ui";
import type { AuthMeResponse } from "@/types/api";

interface InfoResponse {
  client_id: string;
  client_name: string;
  scope_descriptions: string[];
  redirect_uri: string;
  redirect_uri_host: string;
}

export function OAuthConsent() {
  const [searchParams] = useSearchParams();

  const client_id = searchParams.get("client_id");
  const scope = searchParams.get("scope");
  const redirect_uri = searchParams.get("redirect_uri");
  const state = searchParams.get("state");
  const response_type = searchParams.get("response_type");
  const code_challenge = searchParams.get("code_challenge");
  const code_challenge_method = searchParams.get("code_challenge_method");
  const resource = searchParams.get("resource");

  const missingRequired =
    !client_id ||
    !scope ||
    !redirect_uri ||
    !response_type ||
    !code_challenge ||
    !code_challenge_method ||
    !resource;

  const [info, setInfo] = useState<InfoResponse | null>(null);
  const [loading, setLoading] = useState(!missingRequired);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actioning, setActioning] = useState(false);
  const [me, setMe] = useState<{ displayName: string; email: string } | null>(null);
  const requestedWrite = (scope ?? "").includes("mcp.write");
  const [writeGranted, setWriteGranted] = useState(true);

  useEffect(() => {
    if (missingRequired) return;
    let cancelled = false;
    api
      .get<AuthMeResponse>("/auth/me")
      .then((data) => {
        if (!cancelled && data?.user?.display_name) {
          setMe({ displayName: data.user.display_name, email: data.user.email });
        }
      })
      .catch(() => {
        // silently ignore — signed-in pill is optional
      });
    return () => {
      cancelled = true;
    };
  }, [missingRequired]);

  useEffect(() => {
    if (missingRequired) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<InfoResponse>(
        `/oauth/authorize/info?client_id=${encodeURIComponent(client_id!)}&scope=${encodeURIComponent(scope!)}&redirect_uri=${encodeURIComponent(redirect_uri!)}`
      )
      .then((data) => {
        if (!cancelled) {
          setInfo(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchError("Unable to load client information.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [missingRequired, client_id, scope, redirect_uri]);

  if (missingRequired) {
    return (
      <div className="min-h-screen bg-cream-50 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-cream-200 bg-white">
          <span className="text-sm font-semibold text-ink">Family Health</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full p-6 text-center">
            <p className="text-rose-600 text-sm">
              Invalid authorization request. Required parameters are missing.
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream-50 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-cream-200 bg-white">
          <span className="text-sm font-semibold text-ink">Family Health</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-ink-muted text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-cream-50 flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-cream-200 bg-white">
          <span className="text-sm font-semibold text-ink">Family Health</span>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full p-6 text-center">
            <p className="text-rose-600 text-sm">{fetchError}</p>
          </Card>
        </div>
      </div>
    );
  }

  async function handleDecision(decision: "approve" | "deny") {
    setActionError(null);
    setActioning(true);
    try {
      const grantedScope = requestedWrite && !writeGranted ? "mcp.read" : (scope ?? "mcp.read");
      const result = await api.post<{ redirect_to: string }>("/oauth/authorize/decision", {
        client_id,
        redirect_uri,
        scope,
        granted_scope: decision === "approve" ? grantedScope : undefined,
        state: state ?? undefined,
        response_type: response_type ?? undefined,
        code_challenge,
        code_challenge_method,
        resource,
        decision,
      });
      window.location.assign(result.redirect_to);
    } catch (e) {
      setActioning(false);
      setActionError(
        e instanceof ApiError ? e.message : "Something went wrong. Please try again."
      );
    }
  }

  const preset = getPresetByName(info?.client_name ?? "");

  return (
    <div className="min-h-screen bg-cream-50 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-cream-200 bg-white">
        <span className="text-sm font-semibold text-ink">Family Health</span>
        {me && (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-cream-300 flex items-center justify-center text-[11px] font-semibold text-ink-soft flex-shrink-0">
              {me.displayName.trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="hidden sm:block leading-tight text-right">
              <p className="text-xs text-ink font-medium">{me.displayName}</p>
              <p className="text-[10.5px] text-ink-faint">{me.email}</p>
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-[560px] w-full space-y-6 p-8">
          <div className="flex items-start gap-4">
            <AppMark preset={preset} size={56} />
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-ink">{info?.client_name}</p>
              <p className="text-sm text-ink-soft mt-0.5">
                {preset.verified ? preset.publisher : "Unknown publisher"}
              </p>
              {preset.verified ? (
                <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                  <ShieldCheck size={12} aria-hidden />
                  Verified publisher
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                  <ShieldAlert size={12} aria-hidden />
                  Unrecognized app
                </span>
              )}
            </div>
          </div>

          {!preset.verified && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-700">
              This app isn&apos;t published by anyone we know. Only approve if you trust the
              source.
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Requesting access to:</p>
            <ul className="space-y-2">
              {(info?.scope_descriptions ?? []).map((desc, i) => {
                const scopeTokens = (scope ?? "").trim().split(/\s+/);
                const token = i < scopeTokens.length ? scopeTokens[i] : scopeTokens[scopeTokens.length - 1];
                const isWrite = token === "mcp.write" ||
                  (scopeTokens.length !== (info?.scope_descriptions ?? []).length && i > 0 && (scope ?? "").includes("mcp.write"));
                const Icon = isWrite ? Pencil : Eye;
                return (
                  <li key={desc} className="flex items-center gap-2.5 text-sm text-ink-soft">
                    <Icon
                      size={15}
                      className={`flex-shrink-0 ${isWrite && !writeGranted ? "text-ink-faint opacity-30" : "text-ink-faint"}`}
                      aria-hidden
                    />
                    <span className={isWrite && !writeGranted ? "opacity-40 line-through" : ""}>{desc}</span>
                    {isWrite && (
                      <label className="ml-auto flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={writeGranted}
                          onChange={(e) => setWriteGranted(e.target.checked)}
                          className="rounded accent-teal-600"
                          aria-label="Grant write access"
                        />
                        <span className="text-xs text-ink-faint">{writeGranted ? "Include" : "Read only"}</span>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {info?.redirect_uri_host && (
            <p className="text-xs text-ink-muted">
              Returns to{" "}
              <span className="font-medium text-ink-soft">{info.redirect_uri_host}</span>
            </p>
          )}

          {actionError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-600">
              {actionError}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <Btn
              variant="ghost"
              size="sm"
              disabled={actioning}
              onClick={() => void handleDecision("deny")}
            >
              Deny
            </Btn>
            <Btn
              variant="primary"
              size="sm"
              disabled={actioning}
              onClick={() => void handleDecision("approve")}
            >
              {actioning ? "Processing…" : "Approve"}
            </Btn>
          </div>
        </Card>
      </div>
    </div>
  );
}
