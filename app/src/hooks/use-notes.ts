import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ClinicalNote } from "@/types/api";

interface NoteFilters {
  date_from?: string;
  date_to?: string;
  doctor?: string;
  limit?: number;
  offset?: number;
}

// Backend returns { notes: ClinicalNote[] }
interface NotesResponse {
  notes: ClinicalNote[];
}

// Backend returns { note: ClinicalNote }
interface NoteResponse {
  note: ClinicalNote;
}

export function useNotes(patientId: string, filters: NoteFilters = {}) {
  return useQuery({
    queryKey: ["notes", patientId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.doctor) params.set("doctor", filters.doctor);
      if (filters.limit != null) params.set("limit", String(filters.limit));
      if (filters.offset != null) params.set("offset", String(filters.offset));
      const qs = params.toString();
      return api.get<NotesResponse>(
        `/patients/${patientId}/notes${qs ? `?${qs}` : ""}`
      );
    },
    enabled: !!patientId,
  });
}

export function useNote(patientId: string, noteId: string) {
  return useQuery({
    queryKey: ["notes", patientId, noteId],
    queryFn: () =>
      api.get<NoteResponse>(`/patients/${patientId}/notes/${noteId}`),
    enabled: !!patientId && !!noteId,
  });
}

export function useCreateNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FormData) =>
      api.post<NoteResponse>(`/patients/${patientId}/notes`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes", patientId] });
    },
  });
}

interface UpdateNoteRequest {
  visit_date?: string;
  doctor_name?: string;
  facility?: string;
  diagnosis?: string;
  summary?: string;
  treatment_plan?: string;
  document_id?: string | null;
}

export function useUpdateNote(patientId: string, noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateNoteRequest) =>
      api.put<NoteResponse>(`/patients/${patientId}/notes/${noteId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes", patientId] });
    },
  });
}

export function useDeleteNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/patients/${patientId}/notes/${noteId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes", patientId] });
    },
  });
}

export function useTranscribeNote(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId: string) =>
      api.post<NoteResponse>(`/patients/${patientId}/notes/${noteId}/transcribe`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notes", patientId] });
    },
  });
}
