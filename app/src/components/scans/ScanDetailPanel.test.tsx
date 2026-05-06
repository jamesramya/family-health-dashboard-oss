import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScanDetailPanel } from "./ScanDetailPanel";

vi.mock("@/lib/format", () => ({ formatDate: (d: string) => d }));

const baseScan = {
  id: "s1",
  scan_type: "CT Chest",
  body_area: "Chest",
  scan_date: "2024-01-10",
  findings_summary: null,
  impression: null,
  ordering_doctor: null,
  document_id: null,
  patient_id: "p1",
  created_at: "",
  updated_at: "",
} as any;

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("ScanDetailPanel", () => {
  it("renders scan type", () => {
    render(wrap(<ScanDetailPanel scan={baseScan} />));
    expect(screen.getByText("CT Chest")).toBeInTheDocument();
  });

  it("shows findings_summary when provided", () => {
    render(wrap(<ScanDetailPanel scan={{ ...baseScan, findings_summary: "No anomaly detected" }} />));
    expect(screen.getByText("No anomaly detected")).toBeInTheDocument();
  });

  it("omits impression section when null", () => {
    render(wrap(<ScanDetailPanel scan={baseScan} />));
    expect(screen.queryByText(/impression/i)).not.toBeInTheDocument();
  });

  it("shows source link with correct href when document_id set", () => {
    render(wrap(<ScanDetailPanel scan={{ ...baseScan, document_id: "doc42" }} />));
    const link = screen.getByRole("link", { name: /open source document/i });
    expect(link).toHaveAttribute("href", "/documents?doc=doc42");
  });

  it("scan type h2 uses Inter semibold, not Instrument Serif", () => {
    render(wrap(<ScanDetailPanel scan={baseScan} />));
    const h2 = screen.getByRole("heading", { level: 2 });
    expect(h2.className).not.toContain("font-serif");
    expect(h2.className).not.toContain("font-display");
    expect(h2.className).toContain("font-semibold");
  });
});
