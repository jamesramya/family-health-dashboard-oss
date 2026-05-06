import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export function Account() {
  const { user } = useAuth();
  return (
    <Card className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Account</h2>
        <p className="text-sm text-ink-muted">Your profile and sign-in details.</p>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Name</p>
          <p className="text-base text-ink">{user?.display_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Email</p>
          <p className="text-base text-ink">{user?.email ?? "—"}</p>
        </div>
      </div>

      <div className="space-y-3 border-t border-cream-200 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-ink">Password</p>
            <p className="text-xs text-ink-muted">Update your sign-in password</p>
          </div>
          <a
            href="/change-password"
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            Change
          </a>
        </div>

        <div className="flex items-center justify-between opacity-50">
          <div>
            <p className="text-sm font-medium text-ink">Passkeys</p>
            <p className="text-xs text-ink-muted">Sign in without a password</p>
          </div>
          <span className="text-xs text-ink-muted">Coming soon</span>
        </div>

        <div className="flex items-center justify-between opacity-50">
          <div>
            <p className="text-sm font-medium text-ink">Two-factor authentication</p>
            <p className="text-xs text-ink-muted">Add an extra layer of security</p>
          </div>
          <span className="text-xs text-ink-muted">Coming soon</span>
        </div>
      </div>

      <div className="border-t border-rose-100 pt-4">
        <div className="flex items-center justify-between opacity-40">
          <div>
            <p className="text-sm font-medium text-rose-600">Delete account</p>
            <p className="text-xs text-ink-muted">Permanently remove your account and data</p>
          </div>
          <span className="text-xs text-ink-muted">Coming soon</span>
        </div>
      </div>
    </Card>
  );
}
