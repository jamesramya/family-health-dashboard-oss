import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentViewer } from "./DocumentViewer";
import type { Document } from "@/types/api";

vi.mock("@/hooks/use-document-viewer", () => ({
  useDocumentFile: () => ({ blobUrl: null, isLoading: false, error: null }),
  useExtractedData: () => ({ type: null, data: null, isLoading: false, error: null, linkedNotes: null, linkedNotesLoading: false }),
  useFullDocument: () => ({ data: null, isSuccess: false, isPending: false }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useUpdateDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useReprocessDocument: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-medications", () => ({
  useReviewMedication: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const DOC: Document = {
  id: "doc1",
  patient_id: "p1",
  type: "other",
  title: "Test Document",
  document_date: "2026-04-01",
  r2_key: "r2/doc1",
  mime_type: "application/pdf",
  file_size_bytes: 1024,
  source_lab: null,
  processing_status: "pending",
  workflow_instance_id: null,
  medication_review_status: null,
  medication_review_decisions: [],
  llm_raw_response: null,
};

function renderViewer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <DocumentViewer document={DOC} patientId="p1" onClose={vi.fn()} />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe("DocumentViewer", () => {
  it("contains no legacy gray, blue, or red Tailwind tokens in rendered output", () => {
    const { container } = renderViewer();
    expect(container.innerHTML).not.toMatch(/(bg|text|border|ring)-(gray|blue|red)-/);
  });
});
