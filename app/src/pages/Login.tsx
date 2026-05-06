import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useTurnstile } from "@/hooks/use-turnstile";
import { AuthShell } from "@/components/auth/AuthShell";
import { Btn } from "@/components/ui";
import type { LoginResponse } from "@/types/api";

interface FormValues { email: string; password: string; remember: boolean }

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

export function Login() {
  const navigate = useNavigate();
  const { ref: turnstileRef, token: turnstileToken, reset } = useTurnstile(SITE_KEY);
  const [err, setErr] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: { remember: true },
  });

  async function onSubmit(v: FormValues) {
    setErr(null);
    if (!turnstileToken) { setErr("Security check pending — try again in a moment."); return; }
    try {
      const data = await api.post<LoginResponse>("/auth/login", {
        email: v.email, password: v.password, turnstileToken, remember: v.remember,
      });
      if (data.must_change_pw) window.location.href = "/change-password";
      else navigate("/");
    } catch (e) {
      reset();
      setErr(e instanceof ApiError ? e.message : "Sign in failed.");
    }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40 transition-[box-shadow,border-color] duration-160 ease-out-strong";
  const label = "block text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1.5";

  return (
    <AuthShell>
      <h1 className="font-sans text-3xl font-semibold tracking-tight text-ink mb-1">Welcome back</h1>
      <p className="text-ink-muted mb-8">Sign in to your family record.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className={label}>Email</label>
          <input
            id="email" type="email" autoComplete="email"
            placeholder="you@family.com" className={input}
            {...register("email", { required: "Email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" } })}
          />
          {errors.email && <p className="mt-1 text-xs text-rose-500">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className={label}>Password</label>
          <input id="password" type="password" autoComplete="current-password"
            placeholder="••••••••" className={input}
            {...register("password", { required: "Password is required" })} />
          {errors.password && <p className="mt-1 text-xs text-rose-500">{errors.password.message}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" {...register("remember")} className="w-4 h-4 accent-teal-500" />
          Keep me signed in on this device
        </label>

        {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-600">{err}</div>}

        <div ref={turnstileRef} />

        <Btn type="submit" size="lg" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Btn>

        {/* Forgot password hidden until backend reset flow ships */}
      </form>

      <p className="text-xs text-ink-faint mt-6">
        Don't have an account? Ask your family's admin to send you an invite.
      </p>
    </AuthShell>
  );
}
