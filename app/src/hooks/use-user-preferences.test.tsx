import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useUserPreferences } from "./use-user-preferences";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({ textSize: "normal", density: "comfortable", statusLanguage: "plain" }),
    patch: vi.fn().mockResolvedValue({}),
  },
}));

function wrap(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe("useUserPreferences", () => {
  beforeEach(() => localStorage.clear());

  it("returns prefs from the server", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUserPreferences(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.prefs?.textSize).toBe("normal"));
  });

  it("setPref patches the server and updates cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useUserPreferences(), { wrapper: wrap(client) });
    await waitFor(() => expect(result.current.prefs).toBeTruthy());
    await act(async () => { await result.current.setPref("textSize", "xl"); });
    await waitFor(() => expect(result.current.prefs?.textSize).toBe("xl"));
  });
});
