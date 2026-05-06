import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function getUnitSelect(container: HTMLElement): HTMLSelectElement {
  const selects = container.querySelectorAll<HTMLSelectElement>("select");
  const unitSelect = Array.from(selects).find((s) => {
    const opts = Array.from(s.options).map((o) => o.value);
    return opts.some((v) => ["mg/dL", "mmol/L", "kg", "lbs", "°C", "°F", "bpm", "mmHg", "%"].includes(v));
  });
  if (!unitSelect) throw new Error("unit select not found");
  return unitSelect;
}

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  },
}));

import { api } from "@/lib/api";
import { VitalLogPanel } from "@/components/VitalLogPanel";

const mockApi = api as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <VitalLogPanel patientId="patient-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VitalLogPanel — unit selector", () => {
  it("defaults glucose unit to mg/dL (matching typical meter output)", async () => {
    renderPanel();

    const typeSelect = screen.getByDisplayValue(/Blood Pressure/i) as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, "glucose");

    const unitSelect = getUnitSelect(document.body);
    expect(unitSelect.value).toBe("mg/dL");

    const options = Array.from(unitSelect.options).map((o) => o.value);
    expect(options).toEqual(["mg/dL", "mmol/L"]);
  });

  it("saves glucose with default mg/dL unit (not mmol/L)", async () => {
    mockApi.post.mockResolvedValue({ vital: { id: "v1" } });
    renderPanel();

    const typeSelect = screen.getByDisplayValue(/Blood Pressure/i) as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, "glucose");

    const valueInput = screen.getByPlaceholderText("0") as HTMLInputElement;
    await userEvent.type(valueInput, "140");

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalled();
    });

    const [, payload] = mockApi.post.mock.calls[0];
    expect(payload.type).toBe("glucose");
    expect(payload.unit).toBe("mg/dL");
    expect(payload.value_primary).toBe(140);
  });

  it("saves glucose with mmol/L when user selects it", async () => {
    mockApi.post.mockResolvedValue({ vital: { id: "v1" } });
    renderPanel();

    const typeSelect = screen.getByDisplayValue(/Blood Pressure/i) as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, "glucose");

    const unitSelect = getUnitSelect(document.body);
    await userEvent.selectOptions(unitSelect, "mmol/L");

    const valueInput = screen.getByPlaceholderText("0") as HTMLInputElement;
    await userEvent.type(valueInput, "7.2");

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalled();
    });

    const [, payload] = mockApi.post.mock.calls[0];
    expect(payload.unit).toBe("mmol/L");
  });

  it("preserves the parsed unit from the parser response", async () => {
    mockApi.post.mockImplementation((path: string, body: unknown) => {
      if (path.endsWith("/vitals/parse")) {
        return Promise.resolve({
          vitals: [
            {
              type: "glucose",
              measured_at: "2026-04-19T08:00",
              value_primary: 140,
              unit: "mg/dL",
              context: "fasting",
            },
          ],
        });
      }
      return Promise.resolve({ vital: { id: "v1" } });
    });

    renderPanel();

    const nlp = screen.getByPlaceholderText(/BP 120\/80/i);
    await userEvent.type(nlp, "CBG 140 mg/dL fasting");
    await userEvent.click(screen.getByRole("button", { name: /^Parse$/i }));

    await waitFor(() => {
      const unitSelect = getUnitSelect(document.body);
      expect(unitSelect.value).toBe("mg/dL");
    });

    await userEvent.click(screen.getByRole("button", { name: /Save/i }));

    await waitFor(() => {
      const saveCall = mockApi.post.mock.calls.find(
        (c) => !String(c[0]).endsWith("/vitals/parse")
      );
      expect(saveCall).toBeDefined();
      expect((saveCall![1] as { unit: string }).unit).toBe("mg/dL");
    });
  });

  it("resets unit to first option when switching type", async () => {
    renderPanel();

    const typeSelect = screen.getByDisplayValue(/Blood Pressure/i) as HTMLSelectElement;
    await userEvent.selectOptions(typeSelect, "glucose");

    const unitSelect = getUnitSelect(document.body);
    await userEvent.selectOptions(unitSelect, "mmol/L");
    expect(unitSelect.value).toBe("mmol/L");

    await userEvent.selectOptions(typeSelect, "weight");

    const unitSelectAfter = getUnitSelect(document.body);
    expect(unitSelectAfter.value).toBe("kg");
  });
});
