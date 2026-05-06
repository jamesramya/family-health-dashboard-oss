import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

import { api } from "@/lib/api";
import { useUpdateVital } from "@/hooks/use-vitals";

const mockApi = api as { put: ReturnType<typeof vi.fn> };

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe("useUpdateVital", () => {
  it("calls PUT /patients/:pid/vitals/:id with the patch payload", async () => {
    mockApi.put.mockResolvedValue({ vital: { id: "v1" } });

    const { result } = renderHook(() => useUpdateVital("patient-1"), { wrapper });
    result.current.mutate({ vitalId: "v1", data: { value_primary: 130 } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApi.put).toHaveBeenCalledWith(
      "/patients/patient-1/vitals/v1",
      { value_primary: 130 }
    );
  });

  it("exposes isPending while the mutation is in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    mockApi.put.mockReturnValue(new Promise((r) => { resolve = r; }));

    const { result } = renderHook(() => useUpdateVital("patient-1"), { wrapper });
    result.current.mutate({ vitalId: "v1", data: { value_primary: 130 } });

    await waitFor(() => expect(result.current.isPending).toBe(true));
    resolve({ vital: { id: "v1" } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
