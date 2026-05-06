import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BloodWork } from "./BloodWork";

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
  usePatient: () => ({ data: { patient: { id: "p1", name: "Demo" } }, isLoading: false }),
}));

vi.mock("@/hooks/use-blood-work", () => ({
  useBloodWork: vi.fn(() => ({ data: null, isLoading: false, error: null, refetch: vi.fn() })),
}));

vi.mock("@/hooks/use-cultures", () => ({
  useCultures: () => ({ data: null, isLoading: false, error: null }),
}));

vi.mock("@/hooks/useIsMobile", () => ({
  useIsMobile: () => false,
}));

const BLOOD_DATA = {
  categories: [
    {
      category: "haematology" as const,
      tests: [
        {
          id: "t-hgb",
          canonical_name: "haemoglobin",
          label: "Haemoglobin",
          unit: "g/dL",
          category: "haematology" as const,
          ref_low: 12,
          ref_high: 15.5,
          sort_order: 1,
          readings: [
            { id: "r1", patient_id: "p1", test_def_id: "t-hgb", document_id: "d1", date: "2026-04-14", value: 10.4, value_text: null, flag: "LOW", source_lab: "Metropolis", report_file: null },
          ],
        },
      ],
    },
  ],
};

describe("BloodWork", () => {
  it("renders an Upload results button in the section header", () => {
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /upload results/i })).toBeInTheDocument();
  });
});

describe("BloodWork page header", () => {
  it("section eyebrow includes patient name", () => {
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    expect(screen.getByText(/demo/i)).toBeInTheDocument();
  });

  it("section title changes based on active tab", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    // Default blood tab
    expect(screen.getByRole("heading", { name: /blood tests over time/i })).toBeInTheDocument();
    // Switch to cultures tab
    await user.click(screen.getByRole("tab", { name: /cultures/i }));
    expect(screen.getByRole("heading", { name: /culture/i })).toBeInTheDocument();
  });

  it("Upload results button dispatches fh:quickadd-action lab event", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const received: string[] = [];
    window.addEventListener("fh:quickadd-action", (e) => {
      received.push((e as CustomEvent).detail);
    });
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: /upload results/i }));
    expect(received).toContain("lab");
  });
});

describe("BloodWork (with data)", () => {
  it("filter count text starts with 'Showing'", async () => {
    const { useBloodWork } = await import("@/hooks/use-blood-work");
    vi.mocked(useBloodWork).mockReturnValue({ data: BLOOD_DATA, isLoading: false, error: null, refetch: vi.fn() } as never);
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    expect(screen.getByText(/^Showing \d+ of \d+ report/)).toBeInTheDocument();
  });

  it("filter pills use bg-white border for inactive state", async () => {
    const { useBloodWork } = await import("@/hooks/use-blood-work");
    vi.mocked(useBloodWork).mockReturnValue({ data: BLOOD_DATA, isLoading: false, error: null, refetch: vi.fn() } as never);
    render(<MemoryRouter><BloodWork /></MemoryRouter>);
    // Default filter is last10; "Last 5 reports" pill is inactive
    const inactivePill = screen.getByRole("button", { name: /last 5 reports/i });
    expect(inactivePill.className).toMatch(/bg-white/);
    expect(inactivePill.className).toMatch(/border/);
  });
});
