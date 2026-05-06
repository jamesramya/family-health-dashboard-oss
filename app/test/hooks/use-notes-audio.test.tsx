import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateNote, useTranscribeNote } from "@/hooks/use-notes";
import type { ReactNode } from "react";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

vi.mock("@/lib/api", () => ({
  api: {
    post: vi.fn(),
  },
}));

import { api } from "@/lib/api";

describe("useCreateNote", () => {
  it("sends FormData to POST /patients/:pid/notes", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ note: { id: "n1", summary: "Test" } });
    const { result } = renderHook(() => useCreateNote("p1"), { wrapper: makeWrapper() });

    const fd = new FormData();
    fd.append("visit_date", "2024-01-01");
    fd.append("summary", "Test");

    result.current.mutate(fd);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith("/patients/p1/notes", fd);
  });
});

describe("useTranscribeNote", () => {
  it("POSTs to transcribe endpoint with noteId", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ note: { id: "n1", audio_transcript: "Hello." } });
    const { result } = renderHook(() => useTranscribeNote("p1"), { wrapper: makeWrapper() });

    result.current.mutate("n1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.post).toHaveBeenCalledWith("/patients/p1/notes/n1/transcribe", {});
  });
});
