import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Notes } from "./Notes";

vi.mock("@/hooks/use-admin", () => ({
  useDefaultPatientId: () => ({ patientId: "p1", isLoading: false }),
}));

const NOTE = {
  id: "n1",
  patient_id: "p1",
  document_id: null,
  visit_date: "2026-04-15",
  doctor_name: "Dr Smith",
  facility: null,
  diagnosis: null,
  summary: "Routine checkup",
  treatment_plan: null,
};

vi.mock("@/hooks/use-notes", () => ({
  useNotes: () => ({ data: { notes: [NOTE] }, isLoading: false, error: null, refetch: vi.fn() }),
  useDeleteNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTranscribeNote: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-documents", () => ({
  useDocuments: () => ({ data: { documents: [] } }),
}));

vi.mock("@/components/notes/NoteCard", () => ({
  NoteCard: ({ note }: { note: { id: string } }) => <div data-testid={`note-${note.id}`} />,
}));

describe("Notes", () => {
  it("section header title is 'A shared journal'", () => {
    render(<MemoryRouter><Notes /></MemoryRouter>);
    expect(screen.getByText("A shared journal")).toBeInTheDocument();
  });

  it("month group heading uses eyebrow hierarchy, not font-serif", () => {
    render(<MemoryRouter><Notes /></MemoryRouter>);
    const heading = screen.getByText(/april 2026/i);
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass("uppercase");
    expect(heading).not.toHaveClass("font-serif");
  });
});
