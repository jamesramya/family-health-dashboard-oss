import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BloodWorkMobileList } from "./BloodWorkMobileList";
import type { BloodWorkCategory } from "@/types/api";

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
          { id: "r1", patient_id: "p1", test_def_id: "t-hgb", document_id: "d1", date: "2026-01-05", value: 10.9, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
          { id: "r2", patient_id: "p1", test_def_id: "t-hgb", document_id: "d2", date: "2026-04-14", value: 10.4, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
        ],
      },
      {
        id: "t-plt",
        canonical_name: "platelet_count",
        label: "Platelet count",
        unit: "k/μL",
        category: "haematology",
        ref_low: 150,
        ref_high: 400,
        sort_order: 2,
        readings: [
          { id: "r3", patient_id: "p1", test_def_id: "t-plt", document_id: "d2", date: "2026-04-14", value: 265, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: null },
        ],
      },
    ],
  },
];

describe("BloodWorkMobileList", () => {
  it("renders one card per test across all categories", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    expect(screen.getByText("Haemoglobin")).toBeInTheDocument();
    expect(screen.getByText("Platelet count")).toBeInTheDocument();
  });

  it("shows LOW flag on card for out-of-range test", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    expect(screen.getAllByText("LOW").length).toBeGreaterThan(0);
  });

  it("does not show LOW/HIGH flag on in-range test card", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    const pltCard = screen.getByText("Platelet count").closest("button");
    expect(pltCard?.textContent).not.toMatch(/\bLOW\b|\bHIGH\b/);
  });

  it("renders range filter pills 6m, 1y, All", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    expect(screen.getByRole("button", { name: "6m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1y" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
  });

  it("6m pill is active by default", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    const pill = screen.getByRole("button", { name: "6m" });
    expect(pill.className).toMatch(/bg-cream-300/);
  });

  it("tapping a card calls onRowTap with the test and category", async () => {
    const user = userEvent.setup();
    const onRowTap = vi.fn();
    render(<BloodWorkMobileList categories={CATEGORIES} onRowTap={onRowTap} />);
    await user.click(screen.getByText("Haemoglobin").closest("button")!);
    expect(onRowTap).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t-hgb", label: "Haemoglobin" }),
      "haematology"
    );
  });

  it("renders a Spark SVG per card", () => {
    const { container } = render(<BloodWorkMobileList categories={CATEGORIES} />);
    const sparks = container.querySelectorAll("[data-testid='mobile-test-spark'] svg");
    expect(sparks.length).toBe(2);
  });

  it("shows latest value on each card", () => {
    render(<BloodWorkMobileList categories={CATEGORIES} />);
    expect(screen.getByText("10.4")).toBeInTheDocument();
    expect(screen.getByText("265")).toBeInTheDocument();
  });
});
