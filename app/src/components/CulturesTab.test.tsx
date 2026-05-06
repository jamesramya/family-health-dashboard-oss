import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CulturesTab } from "./CulturesTab";
import type { CultureResult } from "@/types/api";

vi.mock("@/hooks/use-cultures", () => ({
  useCultures: () => ({
    data: { cultures: FIXTURES satisfies CultureResult[] },
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  }),
}));

const FIXTURES: CultureResult[] = [
  {
    id: "c1",
    document_id: "d1",
    patient_id: "p1",
    specimen_type: "urine",
    collection_date: "2026-03-20",
    result_status: "positive",
    organism: "E. coli",
    growth_quantity: "heavy",
    sensitivities: [
      { antibiotic: "Ciprofloxacin", result: "S" },
      { antibiotic: "Ampicillin", result: "R" },
    ],
    comments: "Recommend repeat sample",
    created_at: "2026-03-21T10:00:00Z",
    updated_at: "2026-03-21T10:00:00Z",
  },
];

function renderTab() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CulturesTab patientId="p1" />
    </QueryClientProvider>
  );
}

describe("CulturesTab (Apothecary)", () => {
  it("renders cards with rounded-2xl + border-cream-300", () => {
    renderTab();
    const card = screen.getByTestId("culture-card-c1");
    expect(card.className).toMatch(/rounded-2xl/);
    expect(card.className).toMatch(/border-cream-300/);
  });

  it("renders the organism in italic ink text", () => {
    renderTab();
    const org = screen.getByText(/E\. coli/);
    expect(org.className).toMatch(/italic/);
    expect(org.className).toMatch(/text-ink/);
  });

  it("renders sensitivity entries with sage (S) or rose (R) dots", () => {
    renderTab();
    const sDot = screen.getByTestId("sens-dot-Ciprofloxacin");
    const rDot = screen.getByTestId("sens-dot-Ampicillin");
    expect(sDot.className).toMatch(/bg-sage-500/);
    expect(rDot.className).toMatch(/bg-rose-500/);
  });

  it("does not render any text-gray-* / bg-blue-* classnames", () => {
    const { container } = renderTab();
    expect(container.innerHTML).not.toMatch(/text-gray-/);
    expect(container.innerHTML).not.toMatch(/bg-blue-/);
    expect(container.innerHTML).not.toMatch(/border-blue-/);
  });
});
