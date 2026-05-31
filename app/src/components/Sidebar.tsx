import { NavLink } from "react-router-dom";
import {
  Home, FlaskConical, Heart, Pill, NotebookPen, Microscope, FolderOpen,
  Settings as SettingsIcon, LogOut, type LucideIcon,
} from "lucide-react";
import type { UserRole } from "@/types/api";

export interface SidebarUser {
  display_name: string;
  email: string;
  isAdmin: boolean;
  role: UserRole;
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin:  "Admin",
  viewer: "Viewer",
};

interface NavItem {
  to: string;
  label: string;
  Icon: LucideIcon;
  end?: boolean;
}

const CORE: NavItem[] = [
  { to: "/",            label: "Home",        Icon: Home,        end: true },
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

function itemClass({ isActive }: { isActive: boolean }) {
  return `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${
    isActive
      ? "bg-teal-50 text-teal-700"
      : "text-ink-soft [@media(hover:hover)]:hover:bg-cream-100 active:bg-cream-200"
  }`;
}

export function Sidebar({
  user,
  onSignOut,
}: {
  user: SidebarUser;
  onSignOut: () => void;
}) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 bg-white/60 backdrop-blur border-r border-cream-200 flex-col">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden>
            <circle cx="14" cy="14" r="13" fill="#2f6b5f" />
            <path d="M14 7v14M7 14h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="font-display text-2xl text-teal-600 leading-none tracking-tight">Family Health</span>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {CORE.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={itemClass}>
            <Icon size={18} aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-cream-200">
        <div className="flex items-center gap-3 px-2">
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
            className="text-ink-faint [@media(hover:hover)]:hover:text-ink p-1"
          >
            <LogOut size={16} aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
