import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { AuthShell } from "@/components/auth/AuthShell";
import { Btn } from "@/components/ui";

interface FormValues { name: string; password: string; confirm: string }

export function InviteAccept() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const email = params.get("email") ?? "";
  const [err, setErr] = useState<string | null>(null);

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormValues>();
  const pw = watch("password");

  useEffect(() => { if (!token) setErr("Missing invite token."); }, [token]);

  async function onSubmit(v: FormValues) {
    setErr(null);
    try {
      await api.post("/auth/accept-invite", { token, display_name: v.name, password: v.password });
      navigate("/login");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Invite acceptance failed.");
    }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500";

  return (
    <AuthShell heroBody="Your household is inviting you to share their health record.">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">Invitation</p>
      <h2 className="font-serif text-4xl text-ink mt-1 leading-tight">Accept invite</h2>
      <p className="text-sm text-ink-soft mt-2">{email}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
        <input placeholder="Your name" autoComplete="name" className={input} {...register("name", { required: true })} />
        <input placeholder="New password (min 12 chars)" type="password" autoComplete="new-password" className={input}
          {...register("password", { required: true, minLength: 12 })} />
        <input placeholder="Confirm password" type="password" autoComplete="new-password" className={input}
          {...register("confirm", { required: true, validate: (v) => v === pw || "Passwords do not match" })} />
        {errors.confirm && <p className="text-xs text-rose-500">{errors.confirm.message}</p>}
        {err && <p className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-600">{err}</p>}
        <Btn type="submit" size="lg" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Accepting…" : "Accept and sign in"}
        </Btn>
      </form>
    </AuthShell>
  );
}
