import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document, ProcessingStatus } from "@/types/api";

interface DocumentFilters {
  type?: string;
  status?: ProcessingStatus;
  limit?: number;
  offset?: number;
}

// Backend returns { documents: Document[] }
interface DocumentsResponse {
  documents: Document[];
}

// Backend returns { document: Document }
interface DocumentResponse {
  document: Document;
}

export function useDocuments(
  patientId: string,
  filters: DocumentFilters = {}
) {
  return useQuery({
    queryKey: ["documents", patientId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.status) params.set("status", filters.status);
      if (filters.limit != null) params.set("limit", String(filters.limit));
      if (filters.offset != null) params.set("offset", String(filters.offset));
      const qs = params.toString();
      return api.get<DocumentsResponse>(
        `/patients/${patientId}/documents${qs ? `?${qs}` : ""}`
      );
    },
    enabled: !!patientId,
    refetchInterval: (query) => {
      const docs = query.state.data?.documents ?? [];
      return docs.some(
        (d) => d.processing_status === "pending" || d.processing_status === "processing"
      )
        ? 5000
        : false;
    },
  });
}

export function useDocument(patientId: string, documentId: string) {
  return useQuery({
    queryKey: ["documents", patientId, documentId],
    queryFn: () =>
      api.get<DocumentResponse>(
        `/patients/${patientId}/documents/${documentId}`
      ),
    enabled: !!patientId && !!documentId,
  });
}

export function useUploadDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) =>
      api.post<DocumentResponse>(
        `/patients/${patientId}/documents/upload`,
        formData
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", patientId] });
    },
  });
}

export function useDeleteDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api.delete(`/patients/${patientId}/documents/${documentId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", patientId] });
    },
  });
}

export function useUpdateDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; title?: string; document_date?: string; source_lab?: string; type?: string }) =>
      api.patch<DocumentResponse>(`/patients/${patientId}/documents/${id}`, fields),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", patientId] });
    },
  });
}

export function useReprocessDocument(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) =>
      api.post(`/patients/${patientId}/documents/${documentId}/reprocess`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["documents", patientId] });
    },
  });
}
