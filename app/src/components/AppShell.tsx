import { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { Sidebar, type SidebarUser } from "@/components/Sidebar";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { MobileDrawer } from "@/components/MobileDrawer";
import { FamilyStrip } from "@/components/FamilyStrip";
import { TooltipProvider } from "@/components/ui/TooltipProvider";
import { useAuth } from "@/lib/auth-context";
import { usePatients } from "@/hooks/use-admin";
import { useSelectedPatient } from "@/contexts/selected-patient";
import { api } from "@/lib/api";
import { statusForValue, STATUS_MAP, personStatusFromAlerts } from "@/lib/status";
import type { PersonStatus } from "@/lib/status";
import type { DashboardSummary } from "@/types/api";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: patientsData } = usePatients();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { patientId: selectedId, setSelectedId } = useSelectedPatient();

  const patients = patientsData?.patients ?? [];

  const dashboardResults = useQueries({
    queries: patients.map((p) => ({
      queryKey: ["dashboard", p.id],
      queryFn: () => api.get<DashboardSummary>(`/patients/${p.id}/dashboard/summary`),
      enabled: !!p.id,
    })),
  });

  const statusMap: Record<string, PersonStatus> = {};
  patients.forEach((p, i) => {
    const result = dashboardResults[i];
    const alerts = result?.data?.blood_work_alerts ?? [];
    const tones = alerts.map((a) => {
      const s = statusForValue(a.value, a.ref_low_at_test ?? null, a.ref_high_at_test ?? null);
      return { tone: STATUS_MAP[s].tone };
    });
    statusMap[p.id] = personStatusFromAlerts(tones);
  });

  const sbUser: SidebarUser = {
    display_name: user?.display_name ?? "",
    email: user?.email ?? "",
    isAdmin: user?.role === "admin",
    role: user?.role ?? "viewer",
  };

  async function handleSignOut() {
    await logout();
    navigate("/login");
  }

  function handleSearch() {}

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-cream-50 text-ink">
      <Sidebar user={sbUser} onSignOut={handleSignOut} />
      <MobileTopBar
        onOpenMenu={() => setDrawerOpen(true)}
        onSearch={handleSearch}
      />
      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        user={sbUser}
        onSignOut={handleSignOut}
      />
      <div className="lg:pl-60">
        <main key={location.pathname} className="page-enter max-w-6xl mx-auto px-5 lg:px-10 pt-20 lg:pt-8 pb-24 lg:pb-10">
          {patients.length > 0 && (
            <div className="mb-8">
              <FamilyStrip
                patients={patients}
                selectedId={selectedId}
                onSelect={setSelectedId}
                statusFor={(p) => statusMap[p.id] ?? "well"}
                canAddPerson={sbUser.isAdmin}
                onAddPerson={() => navigate("/settings?section=family&action=add")}
              />
            </div>
          )}
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
    </TooltipProvider>
  );
}
