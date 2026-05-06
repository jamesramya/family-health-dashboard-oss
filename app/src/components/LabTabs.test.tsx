import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabTabs } from "./LabTabs";

const TABS = [
  { id: "blood", label: "Blood" },
  { id: "cultures", label: "Cultures" },
  { id: "urine", label: "Urine" },
] as const;

describe("LabTabs", () => {
  it("renders all tabs", () => {
    render(<LabTabs tabs={TABS} active="blood" onChange={() => {}} />);
    for (const t of TABS) {
      expect(screen.getByRole("tab", { name: t.label })).toBeInTheDocument();
    }
  });

  it("marks the active tab with aria-selected and underline style", () => {
    render(<LabTabs tabs={TABS} active="cultures" onChange={() => {}} />);
    const active = screen.getByRole("tab", { name: "Cultures" });
    expect(active).toHaveAttribute("aria-selected", "true");
    expect(active.className).toMatch(/border-teal-600/);
    expect(active.className).toMatch(/text-teal-700/);
  });

  it("marks inactive tabs without underline", () => {
    render(<LabTabs tabs={TABS} active="blood" onChange={() => {}} />);
    const inactive = screen.getByRole("tab", { name: "Cultures" });
    expect(inactive.className).toMatch(/text-ink-muted/);
    expect(inactive.className).not.toMatch(/border-teal-600/);
  });

  it("renders optional count badge next to tab label", () => {
    const tabsWithCount = [
      { id: "blood", label: "Blood", count: 42 },
      { id: "cultures", label: "Cultures", count: 3 },
    ] as const;
    render(<LabTabs tabs={tabsWithCount} active="blood" onChange={() => {}} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onChange when an inactive tab is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LabTabs tabs={TABS} active="blood" onChange={onChange} />);
    await user.click(screen.getByRole("tab", { name: "Cultures" }));
    expect(onChange).toHaveBeenCalledWith("cultures");
  });
});
