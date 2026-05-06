import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Vitals } from "@/pages/Vitals";

const mockReading = {
  id: "r1",
  patient_id: "p1",
  type: "heart_rate",
  measured_at: "2024-01-01T10:00:00.000Z",
  value_primary: 72,
  value_secondary: null,
  value_tertiary: null,
  unit: "bpm",
  context: null,
  notes: null,
  source: "manual",
};

vi.mock("@/hooks/use-vitals", () => ({
  useVitals: () => ({
    data: { vitals: [mockReading] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useCreateVital: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVital: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteVital: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

vi.mock("@/components/VitalLogPanel", () => ({
  VitalLogPanel: () => <div data-testid="vital-log-panel" />,
}));

vi.mock("@/components/VitalChart", () => ({
  VitalChart: () => <div data-testid="vital-chart" />,
}));

vi.mock("@/components/VitalEditRow", () => ({
  VitalEditRow: () => <div data-testid="vital-edit-row" />,
}));

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("Vitals horizontal table scroller", () => {
  it("overflow-x-auto container has fade-scroll-right class", () => {
    const { container } = render(
      <QueryClientProvider client={makeQC()}>
        <MemoryRouter>
          <Vitals />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer?.className).toMatch(/fade-scroll-right/);
  });
});
