import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { SelectedPatientProvider, useSelectedPatient } from "./selected-patient";

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: vi.fn().mockReturnValue({ patientId: "p1", isLoading: false }),
  usePatients: vi.fn().mockReturnValue({
    data: {
      patients: [
        { id: "p1", name: "Demo" },
        { id: "p2", name: "Ravi" },
      ],
    },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <SelectedPatientProvider>{children}</SelectedPatientProvider>;
}

describe("SelectedPatientContext", () => {
  it("initializes patientId from useDefaultPatientId when no explicit selection", () => {
    const { result } = renderHook(() => useSelectedPatient(), { wrapper });
    expect(result.current.patientId).toBe("p1");
  });

  it("calling setSelectedId updates patientId for all consumers", () => {
    const { result } = renderHook(() => useSelectedPatient(), { wrapper });
    act(() => result.current.setSelectedId("p2"));
    expect(result.current.patientId).toBe("p2");
  });

  it("calling setSelectedId(undefined) falls back to the default patient id", () => {
    const { result } = renderHook(() => useSelectedPatient(), { wrapper });
    act(() => result.current.setSelectedId("p2"));
    expect(result.current.patientId).toBe("p2");
    act(() => result.current.setSelectedId(undefined));
    expect(result.current.patientId).toBe("p1");
  });

  it("patientName matches the patient name from the patients list for the active id", () => {
    const { result } = renderHook(() => useSelectedPatient(), { wrapper });
    expect(result.current.patientName).toBe("Demo");
    act(() => result.current.setSelectedId("p2"));
    expect(result.current.patientName).toBe("Ravi");
  });

  it("throws a useful error when used outside SelectedPatientProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSelectedPatient())).toThrow(/SelectedPatientProvider/);
    spy.mockRestore();
  });
});
