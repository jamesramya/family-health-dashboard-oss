import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NoteFormPanel } from "./NoteFormPanel";

vi.mock("@/hooks/use-notes", () => ({
  useCreateNote: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateNote: () => ({ mutate: vi.fn(), isPending: false }),
  useNotes: () => ({ data: { notes: [] } }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({ data: { documents: [] } }),
}));

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NoteFormPanel
        patientId="p1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("NoteFormPanel", () => {
  it("contains no legacy gray, blue, or red Tailwind tokens in rendered output", () => {
    const { container } = renderPanel();
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-(gray|blue|red)-/);
  });
});
