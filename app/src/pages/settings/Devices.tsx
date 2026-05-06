import { Card } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export function Devices() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Connected devices</h2>
        <p className="text-sm text-ink-muted">Manage devices connected to your family's health dashboard.</p>
      </div>
      <p className="text-sm text-ink-soft">Configuration coming soon.</p>
    </Card>
  );
}
