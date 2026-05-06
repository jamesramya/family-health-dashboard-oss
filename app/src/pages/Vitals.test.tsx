import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Vitals } from "./Vitals";

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

vi.mock("@/hooks/use-vitals", () => ({
  useVitals: () => ({ data: { vitals: [] }, isLoading: false, error: null, refetch: vi.fn() }),
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


function renderVitals() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Vitals />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Vitals page — design tokens", () => {
  it('shows "Last 7 days" label (not "Last 7d")', () => {
    renderVitals();
    expect(screen.getByRole("button", { name: "Last 7 days" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Last 7d" })).not.toBeInTheDocument();
  });

  it("active date range button (30d preset default) uses bg-teal-600 not bg-blue-600", () => {
    renderVitals();
    const btn = screen.getByRole("button", { name: "Last 30 days" });
    expect(btn.className).toMatch(/bg-teal-600/);
    expect(btn.className).not.toMatch(/bg-blue-600/);
  });

  it('type filter "All" button (active by default) uses bg-ink class', () => {
    renderVitals();
    // "All" button in type filter row — label is exactly "All"
    const allBtns = screen.getAllByRole("button", { name: "All" });
    // The type filter "All" button should be active (bg-ink)
    const activeAll = allBtns.find((b) => b.className.includes("bg-ink"));
    expect(activeAll).toBeDefined();
  });

  it("inactive date range buttons have border-cream-300 class", () => {
    renderVitals();
    // 7 days, 90 days, and All time are inactive (default is 30d)
    const btn7 = screen.getByRole("button", { name: "Last 7 days" });
    expect(btn7.className).toMatch(/border-cream-300/);
  });

  it("page header contains subtitle text about home readings", () => {
    renderVitals();
    expect(
      screen.getByText(/readings you take at home/i)
    ).toBeInTheDocument();
  });
});

describe("Vitals", () => {
  it("active date preset pill uses teal-600, not blue-600", () => {
    renderVitals();
    const activeBtn = screen.getByRole("button", { name: "Last 30 days" });
    expect(activeBtn).toHaveClass("bg-teal-600");
    expect(activeBtn).not.toHaveClass("bg-blue-600");
  });

  it("active type filter pill uses bg-ink (not teal-600 or blue-600)", () => {
    renderVitals();
    const allBtn = screen.getByRole("button", { name: "All" });
    expect(allBtn).toHaveClass("bg-ink");
    expect(allBtn).not.toHaveClass("bg-blue-600");
  });
});
