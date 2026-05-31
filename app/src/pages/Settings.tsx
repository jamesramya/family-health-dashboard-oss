import { useSearchParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { User, Heart, Shield, Folder, Smartphone, Bot, Sun, Info, ClipboardCheck, Link } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Account } from "./settings/Account";
import { Appearance } from "./settings/Appearance";
import { AIModels } from "./settings/AIModels";
import { About } from "./settings/About";
import { DocumentReview } from "./settings/DocumentReview";
import { Family } from "./settings/Family";
import { Privacy } from "./settings/Privacy";
import { Storage } from "./settings/Storage";
import { Devices } from "./settings/Devices";
import { Integrations } from "./settings/Integrations";

type SectionId = "account" | "family" | "privacy" | "storage" | "devices" | "ai" | "review" | "appearance" | "about" | "integrations";

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
  { id: "ai",           label: "AI models",       adminOnly: true,  icon: Bot            },
  { id: "integrations", label: "Integrations",    adminOnly: true,  icon: Link           },
  { id: "review",       label: "Document review", adminOnly: true,  icon: ClipboardCheck },
  { id: "appearance",   label: "Appearance",      adminOnly: false, icon: Sun            },
  { id: "about",        label: "About",           adminOnly: false, icon: Info           },
];

export function Settings() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: reviewData } = useQuery({
    queryKey: ["admin", "test-review"],
    queryFn: () => api.get<{ items: { id: string }[] }>("/admin/test-review"),
    enabled: isAdmin,
  });
  const hasPendingReview = (reviewData?.items?.length ?? 0) > 0;

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
      case "review":     return <DocumentReview />;
      case "appearance": return <Appearance />;
      case "about":      return <About />;
      case "integrations": return <Integrations />;
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader eyebrow="Preferences" title="Settings" subtitle="Your account, your family, where your data lives, and how the app looks." />

      <div className="lg:grid lg:gap-6" style={{ gridTemplateColumns: "200px 1fr" }}>
        {/* Sidebar nav — fixed 200 px so multi-word labels never wrap */}
        <aside className="mb-4 lg:mb-0 lg:sticky lg:top-6 lg:self-start">
          <div className="bg-white rounded-2xl border border-cream-200 shadow-card p-2">
            <nav role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-0.5 lg:flex-col">
              {visibleSections.map((s) => (
                <button
                  key={s.id}
                  role="tab"
                  aria-selected={activeId === s.id}
                  aria-controls="settings-panel"
                  onClick={() => navigate(s.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${
                    activeId === s.id
                      ? "bg-teal-50 text-teal-700 font-medium"
                      : "text-ink-soft hover:bg-cream-100"
                  }`}
                >
                  <s.icon size={16} aria-hidden={true} />
                  <span className="flex-1 text-left">{s.label}</span>
                  {s.id === "review" && hasPendingReview && (
                    <span data-testid="review-pending-dot" aria-hidden="true" className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  )}
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Section content */}
        <div id="settings-panel" role="tabpanel">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
