import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { LabRowDetailSheet } from "./LabRowDetailSheet";
import type { BloodWorkCategoryItem } from "@/types/api";

function renderWithPrefs(ui: React.ReactElement) {
  return render(<PreferencesProvider>{ui}</PreferencesProvider>);
}

const TEST: BloodWorkCategoryItem = {
  id: "t-hgb",
  canonical_name: "haemoglobin",
  label: "Haemoglobin",
  unit: "g/dL",
  category: "haematology",
  ref_low: 12,
  ref_high: 15.5,
  sort_order: 1,
  readings: [
    { id: "r6", patient_id: "p1", test_def_id: "t-hgb", document_id: "d6", date: "2025-11-21", value: 13.2, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: "https://example.com/r6.pdf" },
    { id: "r5", patient_id: "p1", test_def_id: "t-hgb", document_id: "d5", date: "2025-12-18", value: 12.8, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: null },
    { id: "r4", patient_id: "p1", test_def_id: "t-hgb", document_id: "d4", date: "2026-01-02", value: 12.1, value_text: null, flag: "NORMAL", source_lab: "Metropolis", report_file: null },
    { id: "r3", patient_id: "p1", test_def_id: "t-hgb", document_id: "d3", date: "2026-02-12", value: 11.6, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
    { id: "r2", patient_id: "p1", test_def_id: "t-hgb", document_id: "d2", date: "2026-03-05", value: 10.9, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
    { id: "r1", patient_id: "p1", test_def_id: "t-hgb", document_id: "d1", date: "2026-04-14", value: 10.4, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: "https://example.com/r1.pdf" },
  ],
};

describe("LabRowDetailSheet", () => {
  beforeEach(() => localStorage.clear());

  it("renders the test label as the sheet title", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "Haemoglobin" })).toBeInTheDocument();
  });

  it("renders the eyebrow 'Blood · Haematology'", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByText(/Blood · Haematology/i)).toBeInTheDocument();
  });

  it("shows the reference range in the header", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByText(/ref\s+12[–-]15\.5\s*g\/dL/)).toBeInTheDocument();
  });

  it("shows the latest value '10.4' and its unit as the hero", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByTestId("lab-sheet-hero-value")).toHaveTextContent("10.4");
    expect(screen.getByTestId("lab-sheet-hero-unit")).toHaveTextContent("g/dL");
  });

  it("renders a 'Below normal' status pill for the latest reading", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getAllByText("Below normal").length).toBeGreaterThan(0);
  });

  it("renders three period-filter tabs (6m, 1y, All) with role=tab", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByRole("tab", { name: "6m" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "1y" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
  });

  it("marks the active period tab as aria-selected=true and others as false", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByRole("tab", { name: "6m" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "1y" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "false");
  });

  it("shows reference range caption with 'reference range' and the ref label", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    expect(screen.getByText(/reference range\s*·\s*12[–-]15\.5\s*g\/dL/)).toBeInTheDocument();
  });

  it("renders a StatusPill in the readings list for a below-range reading", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    const list = screen.getByTestId("lab-sheet-readings");
    // The latest reading (10.4) is below range; StatusPill renders its status text
    const statusPills = list.querySelectorAll("span[title]");
    expect(statusPills.length).toBeGreaterThan(0);
  });

  it("lists all readings newest-first with date, lab and value", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    const list = screen.getByTestId("lab-sheet-readings");
    expect(list).toHaveTextContent("10.4");
    expect(list).toHaveTextContent("13.2");
    const firstRow = list.querySelectorAll("[data-testid='lab-sheet-reading']")[0];
    expect(firstRow?.textContent).toContain("10.4");
  });

  it("links the 'View source PDF' footer button to the latest report_file when present", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    const link = screen.getByRole("link", { name: /view source pdf/i });
    expect(link).toHaveAttribute("href", "https://example.com/r1.pdf");
  });

  it("calls onClose when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sheet title uses Inter semibold, not Instrument Serif", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    const heading = screen.getByRole("heading", { name: "Haemoglobin" });
    expect(heading.className).toMatch(/\bfont-semibold\b/);
    expect(heading.className).not.toMatch(/\bfont-display\b/);
    expect(heading.className).not.toMatch(/\bfont-serif\b/);
  });

  it("hero numeric value uses Inter semibold, not Instrument Serif", () => {
    renderWithPrefs(<LabRowDetailSheet test={TEST} categoryLabel="Haematology" isOpen onClose={() => {}} />);
    const heroValue = screen.getByTestId("lab-sheet-hero-value");
    expect(heroValue.className).toMatch(/\bfont-semibold\b/);
    expect(heroValue.className).not.toMatch(/\bfont-display\b/);
    expect(heroValue.className).not.toMatch(/\bfont-serif\b/);
  });
});
