import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Card, Btn } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useUpdateMe } from "@/hooks/use-account";

interface ProfileFormData {
  display_name: string;
  email: string;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (a + b).toUpperCase() || "?";
}

export function Account() {
  const { user, refreshUser } = useAuth();
  const updateMe = useUpdateMe();
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit } = useForm<ProfileFormData>({
    defaultValues: {
      display_name: user?.display_name ?? "",
      email: user?.email ?? "",
    },
  });

  function onSubmit(data: ProfileFormData) {
    updateMe.mutate(data, {
      onSuccess: () => {
        void refreshUser();
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      },
    });
  }

  return (
    <>
      <Card className="space-y-5">
        <div>
          <h2 className="text-2xl font-semibold text-ink">Account</h2>
          <p className="text-sm text-ink-muted">Your profile and sign-in details.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex gap-4 items-start">
            <div className="flex flex-col">
              <span aria-hidden className="text-xs font-medium text-transparent mb-1.5 select-none">
                Display name
              </span>
              <div className="w-12 h-12 rounded-full bg-[#7a5a8f] flex items-center justify-center text-white font-semibold text-base select-none">
                {initialsOf(user?.display_name ?? "?")}
              </div>
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">
                  Display name
                </label>
                <input
                  type="text"
                  {...register("display_name")}
                  className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-soft mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="w-full border border-cream-300 rounded-xl px-3 py-2 text-sm text-ink outline-none focus:border-teal-500"
                />
              </div>
            </div>
          </div>

          {updateMe.isError && (
            <p className="text-sm text-rose-600">
              {(updateMe.error as Error).message}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Btn type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? "Saving…" : "Save"}
            </Btn>
            {saved && <span className="text-sm text-sage-600">Saved</span>}
          </div>
        </form>
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Password</p>
            <p className="text-xs text-ink-muted">Used to unlock your vault.</p>
          </div>
          <a
            href="/change-password"
            className="inline-flex items-center justify-center font-medium rounded-full bg-white border border-cream-300 text-ink-soft hover:bg-cream-100 px-3 py-1.5 text-sm min-h-[36px] transition-colors"
          >
            Change
          </a>
        </div>

        <div className="flex items-center justify-between opacity-50">
          <div>
            <p className="text-sm font-medium text-ink">Passkeys</p>
            <p className="text-xs text-ink-muted">Sign in without a password</p>
          </div>
          <Btn variant="secondary" size="sm" disabled className="cursor-not-allowed">
            Manage
          </Btn>
        </div>

        <div className="flex items-center justify-between opacity-50">
          <div>
            <p className="text-sm font-medium text-ink">Two-factor authentication</p>
            <p className="text-xs text-ink-muted">Add an extra layer of security</p>
          </div>
          <Btn variant="secondary" size="sm" disabled className="cursor-not-allowed">
            Manage
          </Btn>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-rose-600">Delete account</p>
            <p className="text-xs text-ink-muted">All records are wiped. This cannot be undone.</p>
          </div>
          <Btn variant="danger" size="sm" disabled className="opacity-40 cursor-not-allowed">
            Delete
          </Btn>
        </div>
      </Card>

      {user?.role === "admin" && (
        <div className="px-1">
          <Link
            to="/settings?section=review"
            className="text-sm text-ink-faint hover:text-teal-600 transition-colors"
          >
            Review pending extractions →
          </Link>
        </div>
      )}
    </>
  );
}
