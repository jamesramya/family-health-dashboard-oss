import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { AttentionStrip } from "./AttentionStrip";
import type { BloodWorkAlert } from "@/types/api";

const BASE = {
  id: "r1",
  test_def_id: "t1",
  date: "2026-04-20",
  value_text: null,
  source_lab: null,
  category: "haematology" as const,
};

function renderStrip(alerts: BloodWorkAlert[]) {
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <AttentionStrip alerts={alerts} />
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("AttentionStrip", () => {
  it("renders an empty state when there are no alerts", () => {
    renderStrip([]);
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });

  it("renders a row per alert with plain-English label", () => {
    renderStrip([
      { ...BASE, flag: "LOW",  label: "Hemoglobin", unit: "g/dL", value: 10.4, ref_low_at_test: 12, ref_high_at_test: 16 },
      { ...BASE, id: "r2", flag: "HIGH", label: "Glucose",    unit: "mg/dL", value: 210, ref_low_at_test: 70, ref_high_at_test: 110 },
    ]);
    expect(screen.getByText("Hemoglobin")).toBeInTheDocument();
    expect(screen.getByText("Glucose")).toBeInTheDocument();
    // plain-English formatting applied
    expect(screen.queryByText("HGB 10.4 LOW")).not.toBeInTheDocument();
  });

  it("uses a 1-col grid on mobile and 2-col on md+", () => {
    const { container } = renderStrip([
      { ...BASE, flag: "LOW", label: "Hb", unit: "g/dL", value: 10, ref_low_at_test: 12, ref_high_at_test: 16 },
    ]);
    const grid = container.querySelector('[data-testid="attention-grid"]')!;
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/md:grid-cols-2/);
  });

  it("renders 'See all labs →' link in the header when alerts are present", () => {
    renderStrip([
      { ...BASE, flag: "LOW" as const, label: "Hemoglobin", unit: "g/dL", value: 10.4, ref_low_at_test: 12, ref_high_at_test: 16 },
    ]);
    expect(screen.getByRole("link", { name: /see all labs/i })).toBeInTheDocument();
  });

  it("shows the alert's category as the subtitle (not english+date)", () => {
    renderStrip([
      { ...BASE, flag: "LOW" as const, label: "Hemoglobin", unit: "g/dL", value: 10.4, ref_low_at_test: 12, ref_high_at_test: 16 },
    ]);
    expect(screen.getByText("haematology")).toBeInTheDocument();
    expect(screen.queryByText(/2026-04-20/)).not.toBeInTheDocument();
  });

  it("renders a StatusPill chip in each alert item", () => {
    renderStrip([
      { ...BASE, flag: "LOW" as const, label: "Hemoglobin", unit: "g/dL", value: 10.4, ref_low_at_test: 12, ref_high_at_test: 16 },
    ]);
    expect(screen.getByText(/below normal|^low$/i)).toBeInTheDocument();
  });

  it("never shows 'View all' bottom link regardless of alert count", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...BASE,
      id: `r${i}`,
      label: `Lab ${i}`,
      flag: "LOW" as const,
      unit: "x",
      value: 1,
      ref_low_at_test: 5,
      ref_high_at_test: 10,
    }));
    renderStrip(many);
    expect(screen.queryByText(/view all/i)).not.toBeInTheDocument();
  });

  it("wraps alert rows in bg-cream-50/60 container when alerts are present", () => {
    const { container } = renderStrip([
      { ...BASE, flag: "LOW" as const, label: "Hb", unit: "g/dL", value: 10, ref_low_at_test: 12, ref_high_at_test: 16 },
    ]);
    expect(container.querySelector('[class*="bg-cream-50/60"]')).toBeInTheDocument();
  });
});
