import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useTurnstile } from "@/hooks/use-turnstile";
import { AuthShell } from "@/components/auth/AuthShell";
import { Btn } from "@/components/ui";
import type { SetupResponse } from "@/types/api";

type Step = 1 | 2 | 3;

interface AdminForm { email: string; password: string; confirm_password: string; display_name: string }
interface PersonForm { person_name: string; dob: string }
interface AIForm { openai?: string; anthropic?: string; google?: string }

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

export function Setup() {
  const navigate = useNavigate();
  const { ref: turnstileRef, token: turnstileToken, reset } = useTurnstile(SITE_KEY);
  const [step, setStep] = useState<Step>(1);
  const [admin, setAdmin] = useState<AdminForm | null>(null);
  const [person, setPerson] = useState<PersonForm | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.get<{ setup_complete: boolean }>("/setup")
      .then((d) => d.setup_complete ? navigate("/login", { replace: true }) : setChecking(false))
      .catch(() => setChecking(false));
  }, [navigate]);

  async function commit(ai: AIForm) {
    if (!admin || !person) return;
    setErr(null);
    if (!turnstileToken) { setErr("Security check pending."); return; }
    try {
      const data = await api.post<SetupResponse>("/setup", {
        email: admin.email, password: admin.password, display_name: admin.display_name,
        first_patient: { name: person.person_name, date_of_birth: person.dob },
        ai_keys: ai,
        turnstile_token: turnstileToken,
      });
      setApiKey(data.api_key);
    } catch (e) {
      reset();
      setErr(e instanceof ApiError ? e.message : "Setup failed.");
    }
  }

  if (checking) return null;

  if (apiKey) {
    return (
      <AuthShell heroBody="Your admin account is ready.">
        <h2 className="font-serif text-4xl text-ink leading-tight">Setup complete</h2>
        <p className="text-sm text-ink-soft mt-2">Save your recovery API key — it will not be shown again.</p>
        <div className="mt-5 p-4 rounded-xl bg-cream-100 border border-cream-300">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">API key</p>
          <p className="font-mono text-[13px] text-ink break-all">{apiKey}</p>
        </div>
        <Btn size="lg" className="w-full mt-5" onClick={() => navigate("/login")}>Go to sign in</Btn>
      </AuthShell>
    );
  }

  return (
    <AuthShell heroBody="Three short steps and you're in.">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">First run · Step {step} of 3</p>
      <div className="flex gap-1.5 mt-2">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-teal-500" : "bg-cream-200"}`} />
        ))}
      </div>

      {step === 1 && <StepAdmin onNext={(v) => { setAdmin(v); setStep(2); }} />}
      {step === 2 && <StepPerson onBack={() => setStep(1)} onNext={(v) => { setPerson(v); setStep(3); }} />}
      {step === 3 && <StepAI onBack={() => setStep(2)} onSubmit={commit} />}

      {err && <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-100 text-sm text-rose-600">{err}</div>}
      <div ref={turnstileRef} />
    </AuthShell>
  );
}

function StepAdmin({ onNext }: { onNext: (v: AdminForm) => void }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<AdminForm>();
  const pw = watch("password");
  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500";
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4 mt-6">
      <h2 className="font-serif text-3xl text-ink">Create admin account</h2>
      <input placeholder="Display name" autoComplete="name" className={input} {...register("display_name", { required: true })} />
      <input placeholder="Email" type="email" autoComplete="email" className={input} {...register("email", { required: true })} />
      <input placeholder="Password (min 12 chars)" type="password" autoComplete="new-password" className={input}
        {...register("password", { required: true, minLength: 12 })} />
      <input placeholder="Confirm password" type="password" autoComplete="new-password" className={input}
        {...register("confirm_password", { required: true, validate: (v) => v === pw || "Passwords do not match" })} />
      {errors.confirm_password && <p className="text-xs text-rose-500">{errors.confirm_password.message}</p>}
      <Btn type="submit" size="lg" className="w-full">Continue</Btn>
    </form>
  );
}

function StepPerson({ onBack, onNext }: { onBack: () => void; onNext: (v: PersonForm) => void }) {
  const { register, handleSubmit } = useForm<PersonForm>();
  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500";
  return (
    <form onSubmit={handleSubmit(onNext)} className="space-y-4 mt-6">
      <h2 className="font-serif text-3xl text-ink">Add your first person</h2>
      <input placeholder="Name" autoComplete="name" className={input} {...register("person_name", { required: true })} />
      <input type="date" className={input} {...register("dob", { required: true })} />
      <div className="flex gap-2">
        <Btn type="button" variant="secondary" size="lg" onClick={onBack}>Back</Btn>
        <Btn type="submit" size="lg" className="flex-1">Continue</Btn>
      </div>
    </form>
  );
}

function StepAI({ onBack, onSubmit }: { onBack: () => void; onSubmit: (v: AIForm) => void }) {
  const { register, handleSubmit } = useForm<AIForm>();
  const input = "w-full px-4 py-3 rounded-xl border border-cream-300 bg-white text-[16px] text-ink outline-none focus:border-teal-500 font-mono text-[13px]";
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-6">
      <h2 className="font-serif text-3xl text-ink">AI keys · optional</h2>
      <p className="text-sm text-ink-soft">Add later in Settings → AI models if you prefer.</p>
      <input placeholder="OpenAI API key (optional)" className={input} {...register("openai")} />
      <input placeholder="Anthropic API key (optional)" className={input} {...register("anthropic")} />
      <input placeholder="Google API key (optional)" className={input} {...register("google")} />
      <div className="flex gap-2">
        <Btn type="button" variant="secondary" size="lg" onClick={onBack}>Back</Btn>
        <Btn type="submit" size="lg" className="flex-1">Finish setup</Btn>
      </div>
    </form>
  );
}
