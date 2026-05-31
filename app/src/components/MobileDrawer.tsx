import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  X, Home, FlaskConical, Heart, Pill, NotebookPen, Microscope,
  FolderOpen, Settings as SettingsIcon, LogOut, type LucideIcon,
} from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type { SidebarUser } from "@/components/Sidebar";
import type { UserRole } from "@/types/api";

const ROLE_LABEL: Record<UserRole, string> = {
  admin:  "Admin",
  viewer: "Viewer",
};

interface Item { to: string; label: string; Icon: LucideIcon; end?: boolean }

const ITEMS: Item[] = [
  { to: "/",            label: "Home",        Icon: Home, end: true },
  { to: "/blood-work",  label: "Lab results", Icon: FlaskConical },
  { to: "/vitals",      label: "Vitals",      Icon: Heart },
  { to: "/medications", label: "Medications", Icon: Pill },
  { to: "/notes",       label: "Notes",       Icon: NotebookPen },
  { to: "/scans",       label: "Scans",       Icon: Microscope },
  { to: "/documents",   label: "Documents",   Icon: FolderOpen },
  { to: "/settings",    label: "Settings",    Icon: SettingsIcon },
];

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: SidebarUser;
  onSignOut: () => void;
}

export function MobileDrawer({ isOpen, onClose, user, onSignOut }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"open" | "closed">("closed");

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => setState("open"));
    } else {
      setState("closed");
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useFocusTrap(panelRef, isOpen && visible, onClose);

  if (!visible) return null;

  return (
    <div className="lg:hidden fixed inset-0 z-40">
      <div
        data-testid="drawer-backdrop"
        data-drawer-backdrop
        data-state={state}
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
        aria-hidden
      />
      <div
        ref={panelRef}
        data-drawer-panel
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-lift flex flex-col"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden>
              <circle cx="14" cy="14" r="13" fill="#2f6b5f" />
              <path d="M14 7v14M7 14h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            <span className="font-display text-2xl text-teal-600 leading-none">Family Health</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="w-10 h-10 rounded-full grid place-items-center text-ink-soft transition-[transform,background-color] duration-160 ease-out-strong [@media(hover:hover)]:hover:bg-cream-200 active:scale-[0.94] active:bg-cream-300"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium min-h-[48px] transition-colors duration-200 ease-out-strong ${
                  isActive ? "bg-teal-50 text-teal-700" : "text-ink-soft [@media(hover:hover)]:hover:bg-cream-100 active:bg-cream-200"
                }`
              }
            >
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-cream-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cream-300 flex items-center justify-center text-xs font-semibold text-ink-soft flex-shrink-0">
              {userInitials(user.display_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink truncate">{user.display_name}</p>
              <p className="text-xs text-ink-faint truncate">{ROLE_LABEL[user.role]}</p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className="text-ink-faint [@media(hover:hover)]:hover:text-ink min-w-[44px] min-h-[44px] grid place-items-center"
            >
              <LogOut size={16} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
