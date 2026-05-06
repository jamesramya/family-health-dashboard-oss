import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { DocumentViewer } from "@/components/DocumentViewer";
import type { Document } from "@/types/api";

vi.mock("@/lib/api", () => ({ api: { blob: vi.fn(), get: vi.fn() } }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn().mockResolvedValue(false) }));
vi.mock("@/hooks/use-documents", () => ({
  useUpdateDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDocument: () => ({ mutate: vi.fn(), isPending: false }),
  useReprocessDocument: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-medications", () => ({
  useReviewMedication: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-document-viewer", () => ({
  useDocumentFile: () => ({ blobUrl: null, isLoading: true, error: null }),
  useExtractedData: () => ({ data: null, isLoading: true, error: null }),
  useFullDocument: () => ({ data: null, isLoading: true, error: null }),
}));
vi.mock("@/lib/cultures", () => ({
  CULTURE_SPECIMEN_LABELS: {},
  CULTURE_STATUS_BADGE: {},
  SensitivityGrid: () => null,
}));

const doc: Document = {
  id: "d1",
  patient_id: "p1",
  title: "Test Prescription",
  type: "prescription",
  mime_type: "image/jpeg",
  file_size_bytes: 100000,
  document_date: "2026-04-01",
  r2_key: "patients/p1/documents/d1/file.jpg",
  source_lab: null,
  processing_status: "complete",
  workflow_instance_id: null,
  medication_review_status: null,
  medication_review_decisions: [],
  llm_raw_response: null,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("DocumentViewer header", () => {
  it("renders Edit, Delete, and Download buttons", () => {
    render(wrap(<DocumentViewer document={doc} patientId="p1" />));
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();
  });

  it("does not render a Close button", () => {
    render(wrap(<DocumentViewer document={doc} patientId="p1" />));
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("does not render the mobile overflow trigger", () => {
    render(wrap(<DocumentViewer document={doc} patientId="p1" />));
    expect(screen.queryByLabelText("More actions")).not.toBeInTheDocument();
  });
});
