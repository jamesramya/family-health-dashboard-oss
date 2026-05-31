import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { Layout } from "@/components/Layout";
import { UploadQueueProvider } from "@/contexts/upload-queue";
import { SelectedPatientProvider } from "@/contexts/selected-patient";
import { ConfirmProvider } from "@/hooks/use-confirm";

// Public pages
import { Login } from "@/pages/Login";
import { Setup } from "@/pages/Setup";
import { ChangePassword } from "@/pages/ChangePassword";
import { InviteAccept } from "@/pages/InviteAccept";
import { SharedRecord } from "@/pages/SharedRecord";

// Protected pages
import { OAuthConsent } from "@/pages/OAuthConsent";
import { Dashboard } from "@/pages/Dashboard";
import { BloodWork } from "@/pages/BloodWork";
import { Vitals } from "@/pages/Vitals";
import { Medications } from "@/pages/Medications";
import { MedicationsPrint } from "@/pages/MedicationsPrint";
import { Scans } from "@/pages/Scans";
import { Notes } from "@/pages/Notes";
import { Documents } from "@/pages/Documents";
import { Settings } from "@/pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
      <UploadQueueProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/change-password" element={<ChangePassword />} />
          <Route path="/invite/accept" element={<InviteAccept />} />
          <Route path="/share/:token" element={<SharedRecord />} />

          {/* Protected routes — wrapped in AuthProvider + Layout */}
          <Route
            element={
              <AuthProvider>
                <SelectedPatientProvider>
                  <Layout />
                </SelectedPatientProvider>
              </AuthProvider>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="blood-work" element={<BloodWork />} />
            <Route path="vitals" element={<Vitals />} />
            <Route path="medications" element={<Medications />} />
            <Route path="medications/print" element={<MedicationsPrint />} />
            <Route path="scans" element={<Scans />} />
            <Route path="notes" element={<Notes />} />
            <Route path="documents" element={<Documents />} />
            <Route path="settings" element={<Settings />} />
            <Route path="admin/*" element={<Navigate to="/settings" replace />} />
          </Route>

          {/* Protected routes — AuthProvider only, no layout shell */}
          <Route element={<AuthProvider><Outlet /></AuthProvider>}>
            <Route path="oauth/authorize" element={<OAuthConsent />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </UploadQueueProvider>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}
