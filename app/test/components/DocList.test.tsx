import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DocList } from "@/components/documents/DocList";
import type { Document } from "@/types/api";

vi.mock("@/components/DocumentViewer", () => ({
  DocumentViewer: ({ document }: { document: Document }) => (
    <div data-testid={`viewer-${document.id}`} />
  ),
}));

const makeDoc = (id: string): Document => ({
  id,
  patient_id: "p1",
  title: `Document ${id}`,
  type: "prescription",
  mime_type: "image/jpeg",
  file_size_bytes: 50000,
  document_date: "2026-04-01",
  r2_key: `patients/p1/documents/${id}/file.jpg`,
  source_lab: null,
  processing_status: "complete",
  workflow_instance_id: null,
  medication_review_status: null,
  medication_review_decisions: [],
  llm_raw_response: null,
});

const docs = [makeDoc("a"), makeDoc("b")];

function wrap(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("DocList accordion", () => {
  it("renders no viewer when selectedId is null", () => {
    render(wrap(
      <DocList
        header="All documents"
        docs={docs}
        selectedId={null}
        patientId="p1"
        search=""
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />
    ));
    expect(screen.queryByTestId("viewer-a")).not.toBeInTheDocument();
    expect(screen.queryByTestId("viewer-b")).not.toBeInTheDocument();
  });

  it("renders viewer for the selected doc only", () => {
    render(wrap(
      <DocList
        header="All documents"
        docs={docs}
        selectedId="a"
        patientId="p1"
        search=""
        onSearch={vi.fn()}
        onSelect={vi.fn()}
      />
    ));
    expect(screen.getByTestId("viewer-a")).toBeInTheDocument();
    expect(screen.queryByTestId("viewer-b")).not.toBeInTheDocument();
  });

  it("calls onSelect(null) when clicking the already-selected card", () => {
    const onSelect = vi.fn();
    render(wrap(
      <DocList
        header="All documents"
        docs={docs}
        selectedId="a"
        patientId="p1"
        search=""
        onSearch={vi.fn()}
        onSelect={onSelect}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: /Document a/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("calls onSelect with the id when clicking a different card", () => {
    const onSelect = vi.fn();
    render(wrap(
      <DocList
        header="All documents"
        docs={docs}
        selectedId="a"
        patientId="p1"
        search=""
        onSearch={vi.fn()}
        onSelect={onSelect}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: /Document b/i }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });
});
