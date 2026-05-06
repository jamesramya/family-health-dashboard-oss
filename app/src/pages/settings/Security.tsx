import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Btn, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

interface Session { id: string; created_at: string; last_seen: string; user_agent: string; current: boolean }

interface PwForm { current_password: string; new_password: string; confirm: string }

export function Security() {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const sessions = useQuery<{ sessions: Session[] }>({
    queryKey: ["sessions"],
    queryFn: async () => {
      try {
        return await api.get<{ sessions: Session[] }>("/auth/sessions");
      } catch {
        return { sessions: [] };
      }
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.post(`/auth/sessions/${id}/revoke`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const revokeAll = useMutation({
    mutationFn: () => api.post("/auth/sessions/revoke-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });

  const { register, handleSubmit, watch, reset } = useForm<PwForm>();
  const pw = watch("new_password");

  async function changePw(v: PwForm) {
    setErr(null); setOk(null);
    try {
      await api.post("/auth/change-password", { current_password: v.current_password, new_password: v.new_password });
      setOk("Password updated.");
      reset();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Change failed.");
    }
  }

  const inputCls = "w-full px-3 py-2.5 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500";

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Change password</h2>
        </div>
        <form onSubmit={handleSubmit(changePw)} className="space-y-3">
          <input type="password" autoComplete="current-password" placeholder="Current password" className={inputCls}
            {...register("current_password", { required: true })} />
          <input type="password" autoComplete="new-password" placeholder="New password (min 12 chars)" className={inputCls}
            {...register("new_password", { required: true, minLength: 12 })} />
          <input type="password" autoComplete="new-password" placeholder="Confirm new password" className={inputCls}
            {...register("confirm", { required: true, validate: (v) => v === pw || "Passwords do not match" })} />
          {err && <p className="text-sm text-rose-500">{err}</p>}
          {ok && <p className="text-sm text-sage-600">{ok}</p>}
          <Btn type="submit">Update password</Btn>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-semibold text-ink">Active sessions</h2>
          <Btn variant="secondary" onClick={() => revokeAll.mutate()} disabled={revokeAll.isPending}>
            Sign out everywhere
          </Btn>
        </div>
        <ul className="divide-y divide-cream-200">
          {(sessions.data?.sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm text-ink">{s.user_agent}</p>
                <p className="text-xs text-ink-muted font-mono">Last seen {formatDateTime(s.last_seen)}</p>
              </div>
              {s.current ? (
                <span className="text-xs text-teal-600">This device</span>
              ) : (
                <Btn variant="ghost" size="sm" onClick={() => revoke.mutate(s.id)} disabled={revoke.isPending}>
                  Revoke
                </Btn>
              )}
            </li>
          ))}
          {!sessions.data?.sessions?.length && <li className="py-3 text-sm text-ink-muted">No other sessions.</li>}
        </ul>
      </Card>
    </div>
  );
}
