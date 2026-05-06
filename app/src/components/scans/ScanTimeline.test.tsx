import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScanTimeline } from "./ScanTimeline";

vi.mock("@/lib/format", () => ({ formatDate: (d: string) => d }));

const s1 = {
  id: "s1",
  scan_type: "MRI",
  body_area: "Head",
  scan_date: "2023-06-15",
  findings_summary: null,
  impression: null,
  ordering_doctor: null,
  document_id: null,
  patient_id: "p1",
  created_at: "",
  updated_at: "",
} as any;

const s2 = { ...s1, id: "s2", scan_type: "X-Ray", scan_date: "2024-03-01", body_area: null };

describe("ScanTimeline", () => {
  it("renders year group header", () => {
    render(<ScanTimeline scans={[s1]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("2023")).toBeInTheDocument();
  });

  it("shows body_area badge when present", () => {
    render(<ScanTimeline scans={[s1]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Head")).toBeInTheDocument();
  });

  it("omits body_area badge when null", () => {
    render(<ScanTimeline scans={[s2]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.queryByText("Head")).not.toBeInTheDocument();
  });

  it("calls onSelect with scan id on click", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ScanTimeline scans={[s1]} selectedId={null} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /MRI/i }));
    expect(onSelect).toHaveBeenCalledWith("s1");
  });

  it("applies selected styling to active item", () => {
    render(<ScanTimeline scans={[s1]} selectedId="s1" onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /MRI/i })).toHaveClass("bg-teal-50");
  });

  it("year h3 heading uses Inter semibold, not Instrument Serif", () => {
    const { container } = render(<ScanTimeline scans={[s1]} selectedId={null} onSelect={vi.fn()} />);
    const h3 = container.querySelector("h3");
    expect(h3).not.toBeNull();
    expect(h3!.className).not.toContain("font-serif");
    expect(h3!.className).not.toContain("font-display");
    expect(h3!.className).toContain("font-semibold");
  });
});
