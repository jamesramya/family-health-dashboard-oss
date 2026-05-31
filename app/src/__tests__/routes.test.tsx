import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Stub providers that pull in heavy deps
vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: "admin" },
    logout: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("@/contexts/upload-queue", () => ({
  UploadQueueProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/selected-patient", () => ({
  SelectedPatientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-confirm", () => ({
  ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/Layout", async () => {
  const { Outlet } = await import("react-router-dom");
  return { Layout: () => <Outlet /> };
});

// Stub all page components
vi.mock("@/pages/Login", () => ({ Login: () => <div data-testid="login-page" /> }));
vi.mock("@/pages/Setup", () => ({ Setup: () => <div data-testid="setup-page" /> }));
vi.mock("@/pages/ChangePassword", () => ({ ChangePassword: () => <div data-testid="change-password-page" /> }));
vi.mock("@/pages/InviteAccept", () => ({ InviteAccept: () => <div data-testid="invite-accept-page" /> }));
vi.mock("@/pages/Dashboard", () => ({ Dashboard: () => <div data-testid="dashboard-page" /> }));
vi.mock("@/pages/BloodWork", () => ({ BloodWork: () => <div data-testid="blood-work-page" /> }));
vi.mock("@/pages/Vitals", () => ({ Vitals: () => <div data-testid="vitals-page" /> }));
vi.mock("@/pages/Medications", () => ({ Medications: () => <div data-testid="medications-page" /> }));
vi.mock("@/pages/MedicationsPrint", () => ({ MedicationsPrint: () => <div data-testid="medications-print-page" /> }));
vi.mock("@/pages/Scans", () => ({ Scans: () => <div data-testid="scans-page" /> }));
vi.mock("@/pages/Notes", () => ({ Notes: () => <div data-testid="notes-page" /> }));
vi.mock("@/pages/Documents", () => ({ Documents: () => <div data-testid="documents-page" /> }));
vi.mock("@/pages/Admin", () => ({ Admin: () => <div data-testid="admin-page" /> }));
vi.mock("@/pages/Settings", () => ({ Settings: () => <div data-testid="settings-page" /> }));

// Import App after mocks are in place
const { App } = await import("@/App");

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  // Drive the initial URL via window.history so App's BrowserRouter picks it up.
  window.history.pushState({}, "", path);

  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>
  );
}

describe("Admin route removal", () => {
  it("visiting /admin redirects to /settings (no admin page rendered)", () => {
    // Red now: /admin renders <Admin> instead of redirecting.
    // Green after: Route path="admin/*" replaced with Navigate to="/settings".
    renderAt("/admin");
    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });

  it("visiting /admin/review-queue redirects to /settings", () => {
    renderAt("/admin/review-queue");
    expect(screen.queryByTestId("admin-page")).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-page")).toBeInTheDocument();
  });
});
