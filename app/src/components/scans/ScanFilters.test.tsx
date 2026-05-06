import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanFilters } from "./ScanFilters";

const defaults = {
  scanType: "all",
  bodyArea: "all",
  dateRange: "all" as const,
  scanTypes: ["MRI", "X-Ray"],
  bodyAreas: ["Head", "Chest"],
  onScanType: vi.fn(),
  onBodyArea: vi.fn(),
  onDateRange: vi.fn(),
};

describe("ScanFilters", () => {
  it("fires onScanType when scan type changes", async () => {
    const onScanType = vi.fn();
    const user = userEvent.setup();
    render(<ScanFilters {...defaults} onScanType={onScanType} />);
    await user.selectOptions(screen.getByDisplayValue("All types"), "MRI");
    expect(onScanType).toHaveBeenCalledWith("MRI");
  });

  it("fires onBodyArea when body area changes", async () => {
    const onBodyArea = vi.fn();
    const user = userEvent.setup();
    render(<ScanFilters {...defaults} onBodyArea={onBodyArea} />);
    await user.selectOptions(screen.getByDisplayValue("All body areas"), "Head");
    expect(onBodyArea).toHaveBeenCalledWith("Head");
  });

  it("fires onDateRange when a pill is clicked", async () => {
    const onDateRange = vi.fn();
    const user = userEvent.setup();
    render(<ScanFilters {...defaults} onDateRange={onDateRange} />);
    await user.click(screen.getByRole("button", { name: "Last 1 yr" }));
    expect(onDateRange).toHaveBeenCalledWith("1y");
  });

  it("active pill has bg-teal-600", () => {
    render(<ScanFilters {...defaults} dateRange="1y" />);
    expect(screen.getByRole("button", { name: "Last 1 yr" })).toHaveClass("bg-teal-600");
  });
});
