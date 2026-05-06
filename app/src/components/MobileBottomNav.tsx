import { NavLink } from "react-router-dom";
import { Home, FlaskConical, Pill, NotebookPen, MoreHorizontal, type LucideIcon } from "lucide-react";

interface Tab {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: "/",            label: "Home",  Icon: Home,         end: true },
  { to: "/blood-work",  label: "Labs",  Icon: FlaskConical },
  { to: "/medications", label: "Meds",  Icon: Pill },
  { to: "/notes",       label: "Notes", Icon: NotebookPen },
  { to: "/more",        label: "More",  Icon: MoreHorizontal },
];

export function MobileBottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex bg-white/95 backdrop-blur border-t border-cream-200 min-h-[56px] pb-[env(safe-area-inset-bottom)]"
    >
      {TABS.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium min-h-[56px] transition-colors duration-200 active:opacity-70 ${
              isActive ? "text-teal-600" : "text-ink-muted"
            }`
          }
        >
          <Icon size={22} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
