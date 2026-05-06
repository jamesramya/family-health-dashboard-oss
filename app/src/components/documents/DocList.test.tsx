import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocList } from "./DocList";
import type { Document } from "@/types/api";

const baseDoc: Document = {
  id: "1",
  patient_id: "p1",
  type: "other",
  title: "Test Doc",
  document_date: "2025-01-01",
  r2_key: "docs/1/test.pdf",
  mime_type: "application/pdf",
  file_size_bytes: 1024,
  source_lab: null,
  processing_status: "complete",
  workflow_instance_id: null,
  medication_review_status: null,
  medication_review_decisions: [],
  llm_raw_response: null,
};

function renderDocList(docs: Document[]) {
  return render(
    <DocList
      header="Documents"
      docs={docs}
      selectedId={null}
      patientId="p1"
      search=""
      onSearch={vi.fn()}
      onSelect={vi.fn()}
    />
  );
}

describe("DocList file-type badge", () => {
  it("shows PDF for mime_type application/pdf", () => {
    const { container } = renderDocList([{ ...baseDoc, mime_type: "application/pdf" }]);
    expect(container.textContent).toContain("PDF");
  });

  it("shows HEIC for mime_type image/heic", () => {
    const { container } = renderDocList([{ ...baseDoc, mime_type: "image/heic" }]);
    expect(container.textContent).toContain("HEIC");
  });

  it("shows JPG derived from r2_key extension when mime_type is empty", () => {
    const { container } = renderDocList([{ ...baseDoc, mime_type: "", r2_key: "docs/x/photo.jpg" }]);
    expect(container.textContent).toContain("JPG");
  });

  it("renders title and formatted date without error", () => {
    const { container } = renderDocList([baseDoc]);
    expect(screen.getByText("Test Doc")).toBeInTheDocument();
    expect(container.textContent).toMatch(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
  });
});
