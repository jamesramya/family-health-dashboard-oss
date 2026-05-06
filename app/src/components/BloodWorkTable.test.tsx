import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { BloodWorkTable } from "./BloodWorkTable";
import type { BloodWorkCategory } from "@/types/api";

function renderWithPrefs(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

const CATEGORIES: BloodWorkCategory[] = [
  {
    category: "haematology",
    tests: [
      {
        id: "t-hgb",
        canonical_name: "haemoglobin",
        label: "Haemoglobin",
        unit: "g/dL",
        category: "haematology",
        ref_low: 12,
        ref_high: 15.5,
        sort_order: 1,
        readings: [
          { id: "r1", patient_id: "p1", test_def_id: "t-hgb", document_id: "d1", date: "2026-03-05", value: 10.9, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
          { id: "r2", patient_id: "p1", test_def_id: "t-hgb", document_id: "d2", date: "2026-04-14", value: 10.4, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
        ],
      },
    ],
  },
];

describe("BloodWorkTable (Apothecary)", () => {
  beforeEach(() => localStorage.clear());

  it("renders the reference range under the test name (no 'Normal' column)", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    expect(screen.getByText("Haemoglobin")).toBeInTheDocument();
    expect(screen.getByText(/12\s*[–-]\s*15\.5\s*g\/dL/)).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /normal/i })).not.toBeInTheDocument();
  });

  it("embeds a CellSpark SVG for rows with ≥ 2 readings", () => {
    const { container } = renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const sparks = container.querySelectorAll("[data-testid='cell-spark'] svg");
    expect(sparks.length).toBeGreaterThanOrEqual(1);
  });

  it("sticky first cell reports width 220px by default", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const sticky = screen.getAllByTestId("labs-sticky-col")[0];
    expect(sticky.className).toMatch(/w-\[220px\]/);
    expect(sticky.className).toMatch(/sm:w-\[220px\]/);
  });

  it("sticky first cell shrinks to 140px below sm (class contains w-[140px] without sm: prefix)", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const sticky = screen.getAllByTestId("labs-sticky-col")[0];
    expect(sticky.className).toMatch(/(^| )w-\[140px\]/);
  });

  it("fires onRowTap (scoped to active patient) when a row is clicked", async () => {
    const user = userEvent.setup();
    const onRowTap = vi.fn();
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} onRowTap={onRowTap} />);
    const row = screen.getByRole("button", { name: /open haemoglobin detail/i });
    await user.click(row);
    expect(onRowTap).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-hgb", label: "Haemoglobin" }),
      "haematology"
    );
  });

  it("category header renders a text-lg font-semibold h3 (not eyebrow style)", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const heading = screen.getByRole("heading", { level: 3, name: /haematology/i });
    expect(heading.className).toMatch(/\btext-lg\b/);
    expect(heading.className).toMatch(/\bfont-semibold\b/);
    expect(heading.className).not.toMatch(/\buppercase\b/);
    expect(heading.className).not.toMatch(/\btext-xs\b/);
  });

  it("category header shows test count", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    expect(screen.getByText("1 test")).toBeInTheDocument();
  });

  it("shows abnormal badge when tests have out-of-range readings", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    expect(screen.getByText(/1 outside range/)).toBeInTheDocument();
  });

  it("does not show abnormal badge when all readings are in range", () => {
    const inRangeCategories: BloodWorkCategory[] = [
      {
        category: "haematology",
        tests: [
          {
            id: "t-hgb-ok",
            canonical_name: "haemoglobin",
            label: "Haemoglobin",
            unit: "g/dL",
            category: "haematology",
            ref_low: 12,
            ref_high: 15.5,
            sort_order: 1,
            readings: [
              { id: "r1", patient_id: "p1", test_def_id: "t-hgb-ok", document_id: "d1", date: "2026-04-14", value: 13.5, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: null },
            ],
          },
        ],
      },
    ];
    renderWithPrefs(<BloodWorkTable categories={inRangeCategories} />);
    expect(screen.queryByText(/outside range/)).not.toBeInTheDocument();
  });

  it("renders a Trend column header", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    expect(screen.getByRole("columnheader", { name: /trend/i })).toBeInTheDocument();
  });

  it("renders a Spark SVG in the Trend column for each test row", () => {
    const { container } = renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const trendSparks = container.querySelectorAll("[data-testid='trend-spark'] svg");
    expect(trendSparks.length).toBe(1);
  });

  it("date column headers use compact D MMM format without year", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const headers = screen.getAllByRole("columnheader");
    const dateHeaders = headers.filter((h) => /^\d{1,2} [A-Z][a-z]{2}$/.test(h.textContent?.trim().replace(/\s+/g, " ").split("latest")[0].trim() ?? ""));
    expect(dateHeaders.length).toBeGreaterThan(0);
    // No header should contain a year
    headers.forEach((h) => {
      if (/^\d{1,2} [A-Z][a-z]{2}/.test(h.textContent ?? "")) {
        expect(h.textContent).not.toMatch(/\b202\d\b/);
      }
    });
  });

  it("shows 'latest' sublabel on the newest date column", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    expect(screen.getByText("latest")).toBeInTheDocument();
  });

  it("out-of-range cells show LOW or HIGH text flag", () => {
    renderWithPrefs(<BloodWorkTable categories={CATEGORIES} />);
    const flags = screen.getAllByText(/^(LOW|HIGH)$/);
    expect(flags.length).toBeGreaterThan(0);
  });

  it("in-range cells do not show LOW or HIGH text flag", () => {
    const inRangeCategories: BloodWorkCategory[] = [
      {
        category: "haematology",
        tests: [
          {
            id: "t-hgb-ok2",
            canonical_name: "haemoglobin",
            label: "Haemoglobin",
            unit: "g/dL",
            category: "haematology",
            ref_low: 12,
            ref_high: 15.5,
            sort_order: 1,
            readings: [
              { id: "r1", patient_id: "p1", test_def_id: "t-hgb-ok2", document_id: "d1", date: "2026-04-14", value: 13.5, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: null },
            ],
          },
        ],
      },
    ];
    renderWithPrefs(<BloodWorkTable categories={inRangeCategories} />);
    expect(screen.queryByText(/^LOW$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^HIGH$/)).not.toBeInTheDocument();
  });
});
