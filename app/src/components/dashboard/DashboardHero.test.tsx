import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PreferencesProvider } from "@/contexts/PreferencesContext";
import { DashboardHero } from "./DashboardHero";
import type { Patient } from "@/types/api";

const PATIENT: Patient = {
  id: "p1", name: "Demo", date_of_birth: "1950-03-04", gender: "f",
  blood_type: "O+", allergies: null, photo_r2_key: null, created_at: "2024-02-01T00:00:00.000Z",
};

function renderHero(overrides: Partial<Parameters<typeof DashboardHero>[0]> = {}) {
  const props = {
    patient: PATIENT,
    alerts: [],
    statusNote: "Doing well overall. BP on target, next dose in 2 hours.",
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <PreferencesProvider>
        <DashboardHero {...props} />
      </PreferencesProvider>
    </MemoryRouter>
  );
}

describe("DashboardHero", () => {
  it("renders the display heading with the person's first name", () => {
    renderHero();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/how demo is doing/i);
  });

  it("renders the today eyebrow", () => {
    renderHero();
    expect(screen.getByText(/^today/i)).toBeInTheDocument();
  });

  it("renders the status note paragraph", () => {
    renderHero();
    expect(screen.getByText(/BP on target, next dose in 2 hours/i)).toBeInTheDocument();
  });

  it("does not render a quick-add menu trigger in the hero (FAB handles it)", () => {
    renderHero();
    expect(screen.queryByRole("button", { name: /add to record/i })).not.toBeInTheDocument();
    expect(document.querySelector('[aria-haspopup="menu"]')).toBeNull();
  });

  it("shows the AttentionStrip 'all clear' note when there are no alerts", () => {
    renderHero({ alerts: [] });
    expect(screen.getByText(/all clear/i)).toBeInTheDocument();
  });

  it("wraps lastActivity in a cream pill with calendar icon and 'Last update' prefix", () => {
    renderHero({ lastActivity: "2026-04-24T10:00:00Z" });
    const el = screen.getByText(/Last update/i).closest("span");
    expect(el).toHaveClass("bg-cream-100");
    expect(el).toHaveClass("border-cream-200");
    expect(el?.querySelector("svg")).toBeInTheDocument();
  });

  it("renders person status pill derived from alerts", () => {
    renderHero({
      alerts: [
        {
          id: "a1", test_def_id: "t1", date: "2026-04-20", value_text: null, source_lab: null,
          category: "haematology", flag: "HIGH",
          label: "Glucose", unit: "mg/dL", value: 260,
          ref_low_at_test: 70, ref_high_at_test: 110,
        },
      ],
    });
    expect(screen.getByText(/needs attention/i)).toBeInTheDocument();
  });
});
