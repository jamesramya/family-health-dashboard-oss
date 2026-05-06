import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecentVitalsStrip } from "./RecentVitalsStrip";
import type { VitalReading } from "@/types/api";

const V = (type: VitalReading["type"], v: number, at: string): VitalReading => ({
  id: `${type}-${at}`,
  patient_id: "p1",
  type,
  measured_at: at,
  value_primary: v,
  value_secondary: type === "bp" ? 80 : null,
  value_tertiary: null,
  unit: type === "bp" ? "mmHg" : type === "glucose" ? "mg/dL" : "kg",
  context: null,
  notes: null,
  source: "manual",
});

describe("RecentVitalsStrip", () => {
  it("renders an empty hint when readings is empty", () => {
    render(
      <MemoryRouter>
        <RecentVitalsStrip readings={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/no recent readings/i)).toBeInTheDocument();
  });

  it("renders one card per vital type with latest value and sparkline svg", () => {
    const readings = [
      V("bp", 128, "2026-04-20T08:00"),
      V("bp", 124, "2026-04-19T08:00"),
      V("bp", 132, "2026-04-18T08:00"),
      V("glucose", 110, "2026-04-20T09:00"),
      V("glucose", 115, "2026-04-19T09:00"),
    ];
    const { container } = render(
      <MemoryRouter>
        <RecentVitalsStrip readings={readings} />
      </MemoryRouter>
    );
    expect(screen.getByText(/blood pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/glucose/i)).toBeInTheDocument();
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);
    // latest BP value rendered
    expect(screen.getByText(/128\/80/)).toBeInTheDocument();
  });

  it("shows 'today' relative time for same-day readings", () => {
    const readings = [V("glucose", 110, new Date().toISOString())];
    render(
      <MemoryRouter>
        <RecentVitalsStrip readings={readings} />
      </MemoryRouter>
    );
    expect(screen.getByText("today")).toBeInTheDocument();
  });

  it("shows compact relative time matching /\\d+d ago/ for readings 2 days ago", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const readings = [V("glucose", 110, twoDaysAgo)];
    render(
      <MemoryRouter>
        <RecentVitalsStrip readings={readings} />
      </MemoryRouter>
    );
    expect(screen.getByText(/\d+d ago/)).toBeInTheDocument();
  });
});
