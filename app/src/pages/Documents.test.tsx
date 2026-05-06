import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Documents } from "./Documents";

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({ data: { documents: [] } }),
}));

vi.mock("@/contexts/upload-queue", () => ({
  useUploadQueue: () => ({ enqueue: vi.fn(), queue: [] }),
}));

vi.mock("@/components/QuickAddModal", () => ({
  QuickAddModal: ({ kind }: { kind: string | null }) =>
    kind ? <div data-testid="quick-add-modal" data-kind={kind} /> : null,
}));

function renderDocs() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Documents />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Documents", () => {
  it("opens QuickAddModal with kind=document when Upload button is clicked", async () => {
    const user = userEvent.setup();
    renderDocs();

    await user.click(screen.getAllByRole("button", { name: /upload/i })[0]);

    const modal = screen.getByTestId("quick-add-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("data-kind", "document");
  });
});
