import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MiniPillbox } from "./MiniPillbox";
import type { MiniMed } from "@/lib/dashboard-meds";

const MEDS: MiniMed[] = [
  { id: "m1", brand_name: "Metformin",    slot: "morning", dose: "500 mg", specific_time: "08:00", meal_relation: "after_meal" },
  { id: "m2", brand_name: "Atorvastatin", slot: "evening", dose: "10 mg",  specific_time: "20:00", meal_relation: "after_meal" },
  { id: "m3", brand_name: "Aspirin",      slot: "morning", dose: "75 mg",  specific_time: "08:00", meal_relation: "after_meal" },
];

describe("MiniPillbox", () => {
  it("renders one row per non-empty slot grouped by time", () => {
    render(<MiniPillbox meds={MEDS} />);
    expect(screen.getByTestId("pillbox-row-morning")).toBeInTheDocument();
    expect(screen.getByTestId("pillbox-row-evening")).toBeInTheDocument();
    expect(screen.queryByTestId("pillbox-row-afternoon")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pillbox-row-night")).not.toBeInTheDocument();
  });

  it("displays specific_time as the row time label", () => {
    render(<MiniPillbox meds={MEDS} />);
    const morning = screen.getByTestId("pillbox-row-morning");
    expect(morning).toHaveTextContent("08:00");
    const evening = screen.getByTestId("pillbox-row-evening");
    expect(evening).toHaveTextContent("20:00");
  });

  it("displays slot label with meal relation suffix", () => {
    render(<MiniPillbox meds={MEDS} />);
    expect(screen.getByTestId("pillbox-row-morning")).toHaveTextContent("Morning · after food");
    expect(screen.getByTestId("pillbox-row-evening")).toHaveTextContent("Evening · after food");
  });

  it("falls back to slot default time when specific_time is missing", () => {
    const meds: MiniMed[] = [
      { id: "m1", brand_name: "X", slot: "morning", dose: "1", specific_time: null, meal_relation: "not_applicable" },
    ];
    render(<MiniPillbox meds={meds} />);
    expect(screen.getByTestId("pillbox-row-morning")).toHaveTextContent("08:00");
  });

  it("groups multiple meds in the same slot into one row", () => {
    render(<MiniPillbox meds={MEDS} />);
    const morning = screen.getByTestId("pillbox-row-morning");
    expect(morning).toHaveTextContent("Metformin");
    expect(morning).toHaveTextContent("Aspirin");
  });

  it("renders meds as non-interactive spans (not buttons or checkboxes)", () => {
    render(<MiniPillbox meds={MEDS} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("renders an empty-state hint when no meds are scheduled", () => {
    render(<MiniPillbox meds={[]} />);
    expect(screen.getByText(/no medications scheduled/i)).toBeInTheDocument();
  });
});
