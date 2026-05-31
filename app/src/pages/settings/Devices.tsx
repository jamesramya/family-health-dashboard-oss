import { Heart } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const DEVICES = [
  { name: "Omron BP monitor",  status: "Paired · last sync 1 hr ago",      on: true  },
  { name: "Apple Health",      status: "Reading heart rate, weight, steps", on: true  },
  { name: "Dexcom G7",         status: "Not connected",                     on: false },
  { name: "Fitbit",            status: "Not connected",                     on: false },
] as const;

export function Devices() {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;

  return (
    <div className="rounded-2xl border border-cream-200 bg-white shadow-card overflow-hidden">
      <div className="p-6 border-b border-cream-200">
        <h2 className="font-semibold text-lg text-ink">Connected devices</h2>
        <p className="text-sm text-ink-muted mt-0.5">Automatic vitals import from wearables and home devices.</p>
      </div>
      <ul className="divide-y divide-cream-200">
        {DEVICES.map((d) => (
          <li key={d.name} className="flex items-center gap-4 px-6 py-4 opacity-60">
            <div className="w-10 h-10 rounded-lg bg-cream-100 flex items-center justify-center text-ink-soft flex-shrink-0">
              <Heart size={18} aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-ink">{d.name}</p>
              <p className="text-xs text-ink-muted">{d.status}</p>
            </div>
            <span className="text-xs font-medium text-ink-faint bg-cream-100 px-2.5 py-1 rounded-full">
              Coming soon
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
