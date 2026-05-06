import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export function Profile() {
  const { user } = useAuth();
  return (
    <Card>
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Name</p>
          <p className="text-base text-ink">{user?.display_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint mb-1">Email</p>
          <p className="text-base text-ink">{user?.email ?? "—"}</p>
        </div>
        <p className="text-sm text-ink-muted">
          To change your password, use the Security tab or sign out and use the password reset flow.
        </p>
      </div>
    </Card>
  );
}
