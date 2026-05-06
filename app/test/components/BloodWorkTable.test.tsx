import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { BloodWorkTable } from "@/components/BloodWorkTable";
import type { BloodWorkCategory } from "@/types/api";

function renderTable(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

const categories: BloodWorkCategory[] = [
  {
    category: "haematology",
    tests: [
      {
        id: "hb",
        canonical_name: "haemoglobin",
        label: "Haemoglobin",
        unit: "g/dL",
        category: "haematology",
        ref_low: 12,
        ref_high: 16,
        sort_order: 1,
        readings: [
          {
            id: "r2",
            patient_id: "p1",
            test_def_id: "hb",
            document_id: null,
            date: "2026-04-01",
            value: 13.5,
            value_text: null,
            flag: "NORMAL",
            source_lab: null,
            report_file: null,
          },
          {
            id: "r1",
            patient_id: "p1",
            test_def_id: "hb",
            document_id: null,
            date: "2026-03-01",
            value: 11.8,
            value_text: null,
            flag: "LOW",
            source_lab: null,
            report_file: null,
          },
        ],
      },
    ],
  },
];

describe("BloodWorkTable — mobile-friendly layout", () => {
  it("renders a sticky Trend column header with per-row sparkline", () => {
    const { container } = renderTable(<BloodWorkTable categories={categories} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers.some((h) => h?.startsWith("Trend"))).toBe(true);
    const trendSparks = container.querySelectorAll("[data-testid='trend-spark'] svg");
    expect(trendSparks.length).toBeGreaterThan(0);
  });

  it("does not render a dedicated Ref Range column header (range shown inline under test label)", () => {
    renderTable(<BloodWorkTable categories={categories} />);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent?.trim());
    expect(headers).not.toContain("Ref Range");
  });

  it("shows the reference range inline within the Test cell, alongside the label", () => {
    renderTable(<BloodWorkTable categories={categories} />);
    const labelNode = screen.getByText("Haemoglobin");
    const testCell = labelNode.closest("td")!;
    expect(within(testCell).getByText(/12.*–.*16/)).toBeInTheDocument();
    expect(within(testCell).getByText(/g\/dL/)).toBeInTheDocument();
  });

  it("narrows the sticky Test column so the fixed block fits a 390px viewport", () => {
    renderTable(<BloodWorkTable categories={categories} />);
    const testHeader = screen.getAllByRole("columnheader").find(
      (h) => h.textContent?.trim() === "Test"
    )!;
    expect(testHeader.className).toMatch(/w-\[(?:1[3-5]\d)px\]/);
  });

  it("still renders the per-row mini trend sparkline (it's the remaining trend indicator)", () => {
    const { container } = renderTable(<BloodWorkTable categories={categories} />);
    const sparks = container.querySelectorAll("[data-testid='cell-spark'] svg");
    expect(sparks.length).toBeGreaterThan(0);
  });
});
