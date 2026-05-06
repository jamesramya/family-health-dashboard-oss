import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecentTimeline } from "./RecentTimeline";
import type { Document } from "@/types/api";

const DOC = (id: string, title: string, type: Document["type"], date: string): Document => ({
  id,
  patient_id: "p1",
  type,
  title,
  document_date: date,
  r2_key: "k",
  mime_type: "application/pdf",
  file_size_bytes: 1,
  source_lab: null,
  processing_status: "complete",
  workflow_instance_id: null,
  medication_review_status: null,
  medication_review_decisions: [],
  llm_raw_response: null,
});

describe("RecentTimeline", () => {
  it("renders empty state when no documents", () => {
    render(
      <MemoryRouter>
        <RecentTimeline documents={[]} />
      </MemoryRouter>
    );
    expect(screen.getByText(/nothing added recently/i)).toBeInTheDocument();
  });

  it("links each document to /documents?doc=<id>", () => {
    render(
      <MemoryRouter>
        <RecentTimeline
          documents={[DOC("d1", "Annual panel", "blood_report", "2026-04-19")]}
        />
      </MemoryRouter>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/documents?doc=d1");
  });

  it("icon container uses bg-cream-100 text-ink-soft", () => {
    render(
      <MemoryRouter>
        <RecentTimeline
          documents={[DOC("d1", "Annual panel", "blood_report", "2026-04-19")]}
        />
      </MemoryRouter>
    );
    const iconSpan = document.querySelector(".bg-cream-100");
    expect(iconSpan).toBeInTheDocument();
    expect(iconSpan).toHaveClass("text-ink-soft");
  });

  it("renders a row per document with title, type icon, and date", () => {
    render(
      <MemoryRouter>
        <RecentTimeline
          documents={[
            DOC("d1", "Annual panel", "blood_report", "2026-04-19"),
            DOC("d2", "Chest X-ray", "scan", "2026-04-15"),
          ]}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Annual panel")).toBeInTheDocument();
    expect(screen.getByText("Chest X-ray")).toBeInTheDocument();
  });
});
