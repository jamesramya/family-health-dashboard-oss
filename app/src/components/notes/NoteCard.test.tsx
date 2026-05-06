import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { NoteCard } from "./NoteCard";

vi.mock("@/hooks/use-notes", () => ({
  useDeleteNote: () => ({ mutate: vi.fn() }),
  useTranscribeNote: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-confirm", () => ({
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/format", () => ({
  formatDate: (d: string) => d,
}));

const base = {
  id: "n1",
  patient_id: "p1",
  visit_date: "2024-01-15",
  doctor_name: null,
  facility: null,
  diagnosis: "Checkup",
  summary: null,
  treatment_plan: null,
  audio_r2_key: null,
  audio_transcript: null,
  document_id: null,
  created_at: "",
  updated_at: "",
} as any;

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe("NoteCard", () => {
  it("renders diagnosis as title", () => {
    render(wrap(<NoteCard note={base} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByText("Checkup")).toBeInTheDocument();
  });

  it("shows summary when provided", () => {
    render(wrap(<NoteCard note={{ ...base, summary: "Patient stable" }} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByText("Patient stable")).toBeInTheDocument();
  });

  it("omits summary when absent", () => {
    render(wrap(<NoteCard note={base} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.queryByText("Patient stable")).not.toBeInTheDocument();
  });

  it("shows treatment plan when provided", () => {
    render(wrap(<NoteCard note={{ ...base, treatment_plan: "Rest for 2 weeks" }} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByText("Rest for 2 weeks")).toBeInTheDocument();
  });

  it("calls onEdit when edit button clicked", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(wrap(<NoteCard note={base} patientId="p1" onEdit={onEdit} />));
    await user.click(screen.getByRole("button", { name: /edit note/i }));
    expect(onEdit).toHaveBeenCalledWith(base);
  });

  it("shows Transcribe button when audio_r2_key set and no transcript", () => {
    render(wrap(<NoteCard note={{ ...base, audio_r2_key: "r2/key" }} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByRole("button", { name: /transcribe/i })).toBeInTheDocument();
  });

  it("hides Transcribe when transcript already present", () => {
    render(wrap(<NoteCard note={{ ...base, audio_r2_key: "r2/key", audio_transcript: "Hello" }} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.queryByRole("button", { name: /transcribe/i })).not.toBeInTheDocument();
  });

  it("shows transcript text when audio_transcript provided", () => {
    render(wrap(<NoteCard note={{ ...base, audio_transcript: "Hello world" }} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });
});
