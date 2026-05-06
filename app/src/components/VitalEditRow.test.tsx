import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VitalEditRow } from "./VitalEditRow";
import type { VitalReading } from "@/types/api";

vi.mock("@/hooks/use-vitals", () => ({
  useUpdateVital: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteVital: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const READING: VitalReading = {
  id: "vr1",
  patient_id: "p1",
  type: "bp",
  value_primary: 120,
  value_secondary: 80,
  value_tertiary: null,
  unit: "mmHg",
  measured_at: "2026-04-25T10:00:00.000Z",
  context: null,
  notes: null,
  source: "manual",
};

function renderRow(reading = READING) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VitalEditRow reading={reading} patientId="p1" onDone={vi.fn()} />
    </QueryClientProvider>
  );
}

describe("VitalEditRow", () => {
  it("all type='number' inputs have inputMode='decimal'", () => {
    const { container } = renderRow();
    const numericInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    );
    expect(numericInputs.length).toBeGreaterThan(0);
    numericInputs.forEach((input) => {
      expect(input).toHaveAttribute("inputMode", "decimal");
    });
  });

  it("all type='number' inputs have pattern='[0-9]*'", () => {
    const { container } = renderRow();
    const numericInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]')
    );
    expect(numericInputs.length).toBeGreaterThan(0);
    numericInputs.forEach((input) => {
      expect(input).toHaveAttribute("pattern", "[0-9]*");
    });
  });

  it("contains no legacy gray or blue Tailwind tokens", () => {
    const { container } = renderRow();
    const legacyTokenPattern = /(bg|text|border|ring)-(gray|blue)-/;
    expect(legacyTokenPattern.test(container.innerHTML)).toBe(false);
  });
});
