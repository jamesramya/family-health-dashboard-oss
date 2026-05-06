import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { VitalReading } from "@/types/api";
import { VitalChart } from "@/components/VitalChart";

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 500, height: 300 }}>
        {React.cloneElement(children as React.ReactElement, { width: 500, height: 300 })}
      </div>
    ),
  };
});

const readings: VitalReading[] = [
  {
    id: "v1",
    patient_id: "p1",
    type: "heart_rate",
    measured_at: "2026-04-10T08:00:00.000Z",
    value_primary: 72,
    value_secondary: null,
    value_tertiary: null,
    unit: "bpm",
    context: null,
    notes: null,
    source: "manual",
  },
  {
    id: "v2",
    patient_id: "p1",
    type: "heart_rate",
    measured_at: "2026-04-15T08:00:00.000Z",
    value_primary: 80,
    value_secondary: null,
    value_tertiary: null,
    unit: "bpm",
    context: null,
    notes: null,
    source: "manual",
  },
];

describe("VitalChart", () => {
  it("renders without crashing when given readings", () => {
    render(
      <VitalChart readings={readings} label="Heart Rate" unit="bpm" color="#f97316" />
    );
    expect(document.querySelector("svg")).toBeInTheDocument();
  });

  it("shows 'No data' when readings array is empty", () => {
    render(
      <VitalChart readings={[]} label="Heart Rate" unit="bpm" color="#f97316" />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders without crashing when referenceRanges are provided", () => {
    render(
      <VitalChart
        readings={readings}
        label="Heart Rate"
        unit="bpm"
        color="#f97316"
        referenceRanges={[{ y1: 60, y2: 100, color: "#22c55e" }]}
      />
    );
    expect(document.querySelector("svg")).toBeInTheDocument();
  });
});
