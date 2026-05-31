import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { SelectedPatientProvider } from "@/contexts/selected-patient";
import type { DashboardSummary } from "@/types/api";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { id: "u1", display_name: "Ravi", email: "r@x.com", role: "admin" },
    logout: vi.fn(async () => {}),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-admin", () => ({
  usePatients: () => ({
    data: {
      patients: [
        { id: "p1", name: "Demo", date_of_birth: "1950-03-04", gender: "f",
          blood_type: "O+", allergies: null, photo_r2_key: null, created_at: "2024-02-01T00:00:00.000Z" },
        { id: "p2", name: "Ravi",      date_of_birth: "1978-11-12", gender: "m",
          blood_type: null, allergies: null, photo_r2_key: null, created_at: "2024-02-01T00:00:00.000Z" },
      ],
    },
    isLoading: false,
  }),
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

function makeSummary(patientId: string, overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    patient: { id: patientId, name: "Test", date_of_birth: "1970-01-01", gender: "m",
                blood_type: null, allergies: null, photo_r2_key: null, created_at: "2024-02-01T00:00:00.000Z" },
    blood_work_alerts: [],
    active_medications_count: 0,
    latest_vitals: [],
    recent_documents: [],
    pending_prescription_reviews: 0,
    last_activity: null,
    ...overrides,
  };
}

function renderShell(children = <p>page content</p>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  // p1: one alert where value is >5% above ref_high → tone "rose" → status "attention"
  client.setQueryData(["dashboard", "p1"], makeSummary("p1", {
    blood_work_alerts: [
      {
        id: "a1",
        test_def_id: "td1",
        date: "2026-04-01",
        value: 110,
        value_text: null,
        flag: "HIGH",
        source_lab: null,
        ref_low_at_test: 70,
        ref_high_at_test: 100,
        label: "Glucose",
        unit: "mg/dL",
        category: "blood_glucose",
      },
    ],
  }));

  // p2: no alerts → status "well"
  client.setQueryData(["dashboard", "p2"], makeSummary("p2"));

  return render(
    <QueryClientProvider client={client}>
      <PreferencesProvider>
        <MemoryRouter>
          <SelectedPatientProvider>
            <AppShell>{children}</AppShell>
          </SelectedPatientProvider>
        </MemoryRouter>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

describe("AppShell", () => {
  it("renders the sidebar wordmark, family strip, and children", () => {
    renderShell();
    expect(screen.getAllByText("Family Health").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /demo/i })).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("Add person button navigates to Settings > Family with action=add", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    renderShell();
    await user.click(screen.getByRole("button", { name: /add person/i }));
    expect(mockNavigate).toHaveBeenCalledWith("/settings?section=family&action=add");
  });

  it("opens and closes the mobile drawer via hamburger", async () => {
    const user = userEvent.setup();
    renderShell(<p>x</p>);
    expect(screen.queryByRole("dialog", { name: /navigation/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open navigation/i }));
    expect(screen.getByRole("dialog", { name: /navigation/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close navigation/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /navigation/i })).not.toBeInTheDocument();
    });
  });

  it("wraps content in a max-w-6xl container", () => {
    const { container } = renderShell(<p>x</p>);
    const main = container.querySelector("main")!;
    expect(main.className).toMatch(/max-w-6xl/);
  });

  it("FamilyStrip statusFor reflects real patient alerts", () => {
    renderShell();
    // p1 has an alert where value (110) is >5% above ref_high (100) → rose tone → "attention"
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    // p2 has no alerts → "well"
    expect(screen.getByText("Doing well")).toBeInTheDocument();
  });
});
