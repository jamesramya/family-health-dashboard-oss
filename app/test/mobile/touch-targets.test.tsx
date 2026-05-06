import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Btn } from "@/components/ui";
import { FloatingAddFab } from "@/components/FloatingAddFab";
import { Dashboard } from "@/pages/Dashboard";
import { Medications } from "@/pages/Medications";
import { BloodWork } from "@/pages/BloodWork";

// ── shared mocks ──────────────────────────────────────────────────────────────

vi.mock("@/contexts/PreferencesContext", () => ({
  usePreferences: () => ({
    prefs: { textSize: "normal", density: "comfortable", statusLanguage: "plain" },
    setPref: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
  usePatient: () => ({ data: { patient: { id: "p1", name: "Demo" } }, isLoading: false }),
  usePatients: () => ({
    data: { patients: [{ id: "p1", name: "Demo" }] },
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-dashboard", () => ({
  useDashboard: () => ({
    data: {
      patient: { id: "p1", name: "Demo", date_of_birth: "1950-01-01", gender: "F", blood_type: null, allergies: null, photo_r2_key: null },
      blood_work_alerts: [],
      active_medications_count: 2,
      latest_vitals: [],
      recent_documents: [],
      pending_prescription_reviews: 0,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-medications", () => ({
  useMedications: () => ({
    data: { medications: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({
    data: { documents: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-blood-work", () => ({
  useBloodWork: () => ({
    data: {
      categories: [
        {
          category: "haematology",
          tests: [
            {
              id: "t1",
              canonical_name: "Haemoglobin",
              readings: [
                { id: "r1", date: "2024-01-01", value: 13.5, unit: "g/dL", status: "normal", ref_low: 12, ref_high: 16 },
              ],
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useMedicationSearch", () => ({
  useMedicationSearch: (_meds: unknown[], _query: string) => [],
}));

vi.mock("@/components/DailyPillbox", () => ({
  DailyPillbox: () => <div data-testid="daily-pillbox" />,
}));

vi.mock("@/components/AsNeededRail", () => ({
  AsNeededRail: () => <div data-testid="as-needed-rail" />,
}));

vi.mock("@/components/BloodWorkTable", () => ({
  BloodWorkTable: () => <div data-testid="blood-work-table" />,
}));

vi.mock("@/components/BloodWorkMobileList", () => ({
  BloodWorkMobileList: () => <div data-testid="blood-work-mobile-list" />,
}));

vi.mock("@/components/CulturesTab", () => ({
  CulturesTab: () => <div data-testid="cultures-tab" />,
}));

vi.mock("@/components/LabRowDetailSheet", () => ({
  LabRowDetailSheet: () => <div data-testid="lab-row-detail-sheet" />,
}));

vi.mock("@/components/dashboard/MiniPillbox", () => ({
  MiniPillbox: () => <div data-testid="mini-pillbox" />,
}));

vi.mock("@/components/dashboard/RecentVitalsStrip", () => ({
  RecentVitalsStrip: () => <div data-testid="recent-vitals-strip" />,
}));

vi.mock("@/components/dashboard/RecentTimeline", () => ({
  RecentTimeline: () => <div data-testid="recent-timeline" />,
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(el: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter>
        {el}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ── existing Btn tests ────────────────────────────────────────────────────────

describe("Touch target: Btn component", () => {
  it("Btn (size=sm) has min-h-[36px]", () => {
    const { container } = render(<Btn size="sm">Test</Btn>);
    const btn = container.querySelector("button");
    expect(btn?.className).toMatch(/min-h-\[36px\]/);
  });

  it("Btn (size=md, default) has min-h-[44px]", () => {
    const { container } = render(<Btn>Test</Btn>);
    const btn = container.querySelector("button");
    expect(btn?.className).toMatch(/min-h-\[44px\]/);
  });

  it("Btn (size=lg) has min-h-[48px]", () => {
    const { container } = render(<Btn size="lg">Test</Btn>);
    const btn = container.querySelector("button");
    expect(btn?.className).toMatch(/min-h-\[48px\]/);
  });
});

// ── primary action touch target audits (key buttons verified; icon-only buttons excluded) ──

describe("Touch targets: FloatingAddFab trigger button", () => {
  it("FloatingAddFab trigger button meets touch target (≥44px via h-14 = 56px)", () => {
    const { container } = render(<FloatingAddFab onAction={vi.fn()} />);
    // The trigger button is the last button rendered (after the action pills)
    const buttons = Array.from(container.querySelectorAll("button"));
    const trigger = buttons.find((b) => b.getAttribute("aria-label") === "Quick add");
    expect(trigger).not.toBeUndefined();
    // h-14 = 56px which satisfies the ≥44px touch target requirement
    expect(trigger?.className).toMatch(/\bh-14\b/);
  });
});

describe("Touch targets: Medications key primary actions", () => {
  it("primary action buttons (Print, Add medication) have min-h-[44px] or above", () => {
    const { container } = wrap(<Medications />);
    const buttons = Array.from(container.querySelectorAll("button"));
    const primaryBtns = buttons.filter((b) => {
      const text = b.textContent ?? "";
      return text.includes("Print") || text.includes("Add medication");
    });
    expect(primaryBtns.length).toBeGreaterThanOrEqual(2);
    primaryBtns.forEach((btn) => {
      expect(btn.className).toMatch(/min-h-\[(?:44|48|52)px\]/);
    });
  });
});

describe("Touch targets: Labs key primary actions", () => {
  it("date-filter buttons have min-h-[44px] or above", () => {
    const { container } = wrap(<BloodWork />);
    const buttons = Array.from(container.querySelectorAll("button"));
    const filterBtns = buttons.filter((b) => {
      const text = b.textContent ?? "";
      return ["Last 5", "Last 10", "All", "Custom"].includes(text.trim());
    });
    expect(filterBtns.length).toBeGreaterThanOrEqual(1);
    filterBtns.forEach((btn) => {
      expect(btn.className).toMatch(/min-h-\[(?:44|48|52)px\]/);
    });
  });
});
