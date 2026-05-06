import { useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { User, Heart, Shield, Folder, Smartphone, Bot, Sun, Info } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAuth } from "@/lib/auth-context";
import { Account } from "./settings/Account";
import { Appearance } from "./settings/Appearance";
import { AIModels } from "./settings/AIModels";
import { About } from "./settings/About";
import { Family } from "./settings/Family";
import { Privacy } from "./settings/Privacy";
import { Storage } from "./settings/Storage";
import { Devices } from "./settings/Devices";

type SectionId = "account" | "family" | "privacy" | "storage" | "devices" | "ai" | "appearance" | "about";

interface Section {
  id: SectionId;
  label: string;
  adminOnly: boolean;
  icon: LucideIcon;
}

const SECTIONS: Section[] = [
  { id: "account",    label: "Account",           adminOnly: false, icon: User       },
  { id: "family",     label: "Family",            adminOnly: true,  icon: Heart      },
  { id: "privacy",    label: "Privacy & sharing", adminOnly: true,  icon: Shield     },
  { id: "storage",    label: "Storage & backup",  adminOnly: true,  icon: Folder     },
  { id: "devices",    label: "Connected devices", adminOnly: true,  icon: Smartphone },
  { id: "ai",         label: "AI models",         adminOnly: true,  icon: Bot        },
  { id: "appearance", label: "Appearance",        adminOnly: false, icon: Sun        },
  { id: "about",      label: "About",             adminOnly: false, icon: Info       },
];

export function Settings() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  const rawSection = params.get("section") as SectionId | null;
  const isValidSection = rawSection !== null && visibleSections.some((s) => s.id === rawSection);
  const activeId: SectionId = isValidSection ? rawSection : "account";

  function navigate(id: SectionId) {
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("section", id);
      return n;
    });
  }

  function renderSection() {
    switch (activeId) {
      case "account":    return <Account />;
      case "family":     return <Family />;
      case "privacy":    return <Privacy />;
      case "storage":    return <Storage />;
      case "devices":    return <Devices />;
      case "ai":         return <AIModels />;
      case "appearance": return <Appearance />;
      case "about":      return <About />;
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Preferences" title="Settings" subtitle="Preferences sync to this device for now." />

      <div className="lg:grid lg:grid-cols-5 lg:gap-8">
        {/* Sidebar nav */}
        <aside className="lg:col-span-1 mb-4 lg:mb-0">
          <nav role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {visibleSections.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={activeId === s.id}
                onClick={() => navigate(s.id)}
                className={`min-h-[40px] px-4 rounded-xl text-sm font-medium transition-colors text-left flex items-center gap-2 ${
                  activeId === s.id
                    ? "bg-teal-50 text-teal-700 border border-teal-200"
                    : "bg-white border border-cream-200 text-ink-soft hover:bg-cream-100"
                }`}
              >
                <s.icon size={16} aria-hidden={true} />
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Section content */}
        <div className="lg:col-span-4">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
