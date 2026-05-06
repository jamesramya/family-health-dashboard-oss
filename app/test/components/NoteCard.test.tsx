import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { NoteCard } from "@/components/notes/NoteCard";
import type { ClinicalNote } from "@/types/api";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => vi.fn().mockResolvedValue(true) }));

import { api } from "@/lib/api";

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const baseNote: ClinicalNote = {
  id: "n1",
  patient_id: "p1",
  visit_date: "2024-03-15",
  summary: "Regular check-up",
  created_at: "2024-03-15T10:00:00Z",
  updated_at: "2024-03-15T10:00:00Z",
};

describe("NoteCard — transcript", () => {
  it("shows transcript section when audio_transcript is set", () => {
    const note = { ...baseNote, audio_transcript: "Patient reports mild headache." };
    render(wrap(<NoteCard note={note} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByText("Patient reports mild headache.")).toBeInTheDocument();
    expect(screen.getByText(/transcript/i)).toBeInTheDocument();
  });

  it("shows Transcribe button when audio_r2_key is set but no transcript", () => {
    const note = { ...baseNote, audio_r2_key: "patients/p1/notes/n1/recording.webm", audio_transcript: null };
    render(wrap(<NoteCard note={note} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.getByRole("button", { name: /transcribe/i })).toBeInTheDocument();
  });

  it("calls transcribe mutation when Transcribe button clicked", async () => {
    vi.mocked(api.post).mockResolvedValue({ note: { ...baseNote, audio_transcript: "Hello." } });
    const note = { ...baseNote, audio_r2_key: "patients/p1/notes/n1/recording.webm", audio_transcript: null };
    render(wrap(<NoteCard note={note} patientId="p1" onEdit={vi.fn()} />));
    fireEvent.click(screen.getByRole("button", { name: /transcribe/i }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/patients/p1/notes/n1/transcribe", {}));
  });

  it("does not show Transcribe button when transcript already exists", () => {
    const note = { ...baseNote, audio_r2_key: "patients/p1/notes/n1/recording.webm", audio_transcript: "Already done." };
    render(wrap(<NoteCard note={note} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.queryByRole("button", { name: /transcribe/i })).not.toBeInTheDocument();
  });

  it("does not show transcript section when audio_transcript is null", () => {
    const note = { ...baseNote, audio_transcript: null };
    render(wrap(<NoteCard note={note} patientId="p1" onEdit={vi.fn()} />));
    expect(screen.queryByText(/transcript/i)).not.toBeInTheDocument();
  });
});
