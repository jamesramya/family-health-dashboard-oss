import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MedicationsPrint } from "./MedicationsPrint";
import { useMedications } from "@/hooks/use-medications";

vi.mock("@/hooks/use-medications", () => ({ useMedications: vi.fn() }));
vi.mock("@/lib/medNames", () => ({ formatMedName: (b: string) => b }));

const mockUseMedications = useMedications as ReturnType<typeof vi.fn>;

const sampleMeds = [
  {
    id: "m1",
    brand_name: "Aspirin",
    generic_name: null,
    dosage: "100mg",
    schedules: [{ id: "sc1", time_of_day: "morning", specific_time: null }],
  },
];

function wrap(url = "?person=p1&date=2024-01-01") {
  return (
    <MemoryRouter initialEntries={[`/print${url}`]}>
      <MedicationsPrint />
    </MemoryRouter>
  );
}

describe("MedicationsPrint", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state", () => {
    mockUseMedications.mockReturnValue({ data: undefined, isLoading: true });
    render(wrap());
    expect(screen.getByText(/preparing schedule/i)).toBeInTheDocument();
  });

  it("renders medication in timeline after load", () => {
    mockUseMedications.mockReturnValue({ data: { medications: sampleMeds }, isLoading: false });
    render(wrap());
    expect(screen.getByText("Aspirin")).toBeInTheDocument();
  });

  it("calls window.print after data loads", () => {
    vi.useFakeTimers();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    mockUseMedications.mockReturnValue({ data: { medications: sampleMeds }, isLoading: false });
    render(wrap());
    vi.runAllTimers();
    expect(printSpy).toHaveBeenCalled();
    vi.useRealTimers();
    printSpy.mockRestore();
  });

  it("calls useMedications with person id from URL", () => {
    mockUseMedications.mockReturnValue({ data: undefined, isLoading: true });
    render(wrap("?person=p1&date=2024-01-01"));
    expect(mockUseMedications).toHaveBeenCalledWith("p1", true);
  });

  it("renders date from URL param in D MMM YYYY format", () => {
    mockUseMedications.mockReturnValue({ data: { medications: [] }, isLoading: false });
    render(wrap("?person=p1&date=2024-01-01"));
    expect(screen.getByText(/jan 2024/i)).toBeInTheDocument();
  });

  it("shows dose_quantity when set, falls back to med.dosage", () => {
    mockUseMedications.mockReturnValue({
      data: {
        medications: [{
          id: "e1",
          brand_name: "Eltroxin",
          generic_name: null,
          dosage: "75 mcg",
          schedules: [
            { id: "sa", time_of_day: "morning", specific_time: null, dose_quantity: "75 mcg", days_of_week: "mon,tue,wed,thu,fri" },
            { id: "sb", time_of_day: "morning", specific_time: null, dose_quantity: "100 mcg", days_of_week: "sat,sun" },
          ],
        }],
      },
      isLoading: false,
    });
    render(wrap());
    expect(screen.getByText("75 mcg")).toBeInTheDocument();
    expect(screen.getByText("100 mcg")).toBeInTheDocument();
    expect(screen.getByText("Mon–Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat–Sun")).toBeInTheDocument();
  });

  it("page title h1 uses Inter semibold, not Instrument Serif", () => {
    mockUseMedications.mockReturnValue({ data: { medications: sampleMeds }, isLoading: false });
    const { container } = render(wrap());
    const h1 = container.querySelector('h1[class*="text-3xl"]');
    expect(h1).not.toBeNull();
    expect(h1!.className).not.toContain("font-serif");
    expect(h1!.className).not.toContain("font-display");
    expect(h1!.className).toContain("font-semibold");
  });

  it("groups morning before evening in timeline order", () => {
    mockUseMedications.mockReturnValue({
      data: {
        medications: [
          {
            id: "m1",
            brand_name: "MorningPill",
            generic_name: null,
            dosage: "5mg",
            schedules: [{ id: "s1", time_of_day: "morning", specific_time: null }],
          },
          {
            id: "m2",
            brand_name: "EveningPill",
            generic_name: null,
            dosage: "10mg",
            schedules: [{ id: "s2", time_of_day: "evening", specific_time: null }],
          },
        ],
      },
      isLoading: false,
    });
    const { container } = render(wrap());
    const allText = container.textContent ?? "";
    expect(allText.indexOf("MorningPill")).toBeLessThan(allText.indexOf("EveningPill"));
  });
});
