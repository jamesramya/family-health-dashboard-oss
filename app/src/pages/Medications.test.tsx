import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { Medications } from "./Medications";
import type { Medication, MedicationSchedule } from "@/types/api";

vi.mock("@/hooks/use-admin", () => ({
  usePatients: vi.fn(),
}));

const mockUseMedications = vi.fn(() => ({
  data: { medications: [] as (Medication & { schedules: MedicationSchedule[] })[] },
  isLoading: false,
  error: null,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/use-medications", () => ({
  useMedications: () => mockUseMedications(),
  useUpdateMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDiscontinueMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRestartMedication: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useMedicationSearch", () => ({
  useMedicationSearch: (meds: unknown[], _query: string) => meds,
}));

vi.mock("@/components/DailyPillbox", () => ({
  DailyPillbox: () => <div data-testid="daily-pillbox" />,
}));

vi.mock("@/components/AsNeededRail", () => ({
  AsNeededRail: () => <div data-testid="as-needed-rail" />,
}));

vi.mock("@/components/LabTabs", () => ({
  LabTabs: () => <div data-testid="lab-tabs" />,
}));

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

vi.mock("@/components/MedicationForm", () => ({
  MedicationForm: () => <div data-testid="medication-form" />,
}));

vi.mock("@/components/AddMedicationSheet", () => ({
  AddMedicationSheet: () => <div data-testid="add-medication-sheet" />,
}));

import { usePatients } from "@/hooks/use-admin";
const mockUsePatients = usePatients as ReturnType<typeof vi.fn>;

function renderMedications() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Medications />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const eltroxin: Medication & { schedules: MedicationSchedule[] } = {
  id: "e1",
  patient_id: "p1",
  brand_name: "Eltroxin",
  generic_name: "levothyroxine",
  dosage: "75 mcg",
  form: "tablet",
  start_date: "2025-01-01",
  end_date: null,
  reason: "Hypothyroidism",
  is_active: 1,
  notes: null,
  lifecycle_events: [],
  prescription_ids: [],
  schedules: [
    {
      id: "s-e1a",
      medication_id: "e1",
      time_of_day: "morning",
      meal_relation: "empty_stomach",
      dose_quantity: "75 mcg",
      specific_time: null,
      instructions: null,
      days_of_week: "mon,tue,wed,thu,fri",
    },
    {
      id: "s-e1b",
      medication_id: "e1",
      time_of_day: "morning",
      meal_relation: "empty_stomach",
      dose_quantity: "100 mcg",
      specific_time: null,
      instructions: null,
      days_of_week: "sat,sun",
    },
  ],
};

describe("Medications page — patient title", () => {
  it('shows "What Demo is taking" when patientName is "Demo"', () => {
    mockUsePatients.mockReturnValue({
      data: { patients: [{ id: "p1", name: "Demo" }] },
      isLoading: false,
    });
    renderMedications();
    expect(screen.getByText("What Demo is taking")).toBeInTheDocument();
  });

  it('shows the empty-state message when no patient data', () => {
    mockUsePatients.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    renderMedications();
    expect(screen.getByText(/no patient found/i)).toBeInTheDocument();
  });
});

describe("Medications page — add modal typography", () => {
  it("Add medication modal h2 uses Inter semibold, not Instrument Serif", async () => {
    mockUsePatients.mockReturnValue({
      data: { patients: [{ id: "p1", name: "Demo" }] },
      isLoading: false,
    });
    mockUseMedications.mockReturnValue({
      data: { medications: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderMedications();
    await user.click(screen.getByRole("button", { name: /add medication/i }));
    const modalH2 = screen.getByRole("heading", { level: 2, name: /add medication/i });
    expect(modalH2.className).not.toContain("font-serif");
    expect(modalH2.className).not.toContain("font-display");
    expect(modalH2.className).toContain("font-semibold");
  });
});

describe("Medications page — list cards", () => {
  beforeEach(() => {
    mockUsePatients.mockReturnValue({
      data: { patients: [{ id: "p1", name: "Demo" }] },
      isLoading: false,
    });
    mockUseMedications.mockReturnValue({
      data: { medications: [eltroxin] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it("each card has an Edit medication button", () => {
    renderMedications();
    expect(screen.getByRole("button", { name: /edit medication/i })).toBeInTheDocument();
  });

  it("list card renders two dose rows with day badges for Eltroxin", () => {
    renderMedications();
    expect(screen.getByText("Mon–Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat–Sun")).toBeInTheDocument();
    expect(screen.getAllByText(/75 mcg/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/100 mcg/i)).toBeInTheDocument();
  });

  it("clicking Edit button shows MedicationEditRow (teal panel)", async () => {
    const user = userEvent.setup();
    renderMedications();
    await user.click(screen.getByRole("button", { name: /edit medication/i }));
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });
});
