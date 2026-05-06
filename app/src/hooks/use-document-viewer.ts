import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Document, DocumentType } from "@/types/api";

export function useDocumentFile(patientId: string, documentId: string | null) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const { data: blob, isLoading, error } = useQuery({
    queryKey: ["document-file", patientId, documentId],
    queryFn: () => api.blob(`/patients/${patientId}/documents/${documentId}/file`),
    enabled: !!patientId && !!documentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60_000,
  });

  useEffect(() => {
    if (!blob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return { blobUrl, isLoading, error };
}

interface ExtractedDataResult {
  type: DocumentType;
  data: unknown;
  isLoading: boolean;
  error: Error | null;
  linkedNotes: unknown;
  linkedNotesLoading: boolean;
}

export function useExtractedData(patientId: string, document: Document | null): ExtractedDataResult {
  const docType = document?.type ?? "other";
  const docId = document?.id ?? "";
  const isComplete = document?.processing_status === "complete";

  const bloodWork = useQuery({
    queryKey: ["blood-work", patientId, { document_id: docId }],
    queryFn: () => api.get<{ results: unknown[] }>(`/patients/${patientId}/blood-work?document_id=${docId}`),
    enabled: !!patientId && !!docId && isComplete && docType === "blood_report",
  });

  const scans = useQuery({
    queryKey: ["scans", patientId, { document_id: docId }],
    queryFn: () => api.get<{ scans: unknown[] }>(`/patients/${patientId}/scans?document_id=${docId}`),
    enabled: !!patientId && !!docId && isComplete && (docType === "scan" || docType === "ecg"),
  });

  const medications = useQuery({
    queryKey: ["medications", patientId, { document_id: docId }],
    queryFn: () => api.get<{ medications: unknown[] }>(`/patients/${patientId}/medications?document_id=${docId}`),
    enabled: !!patientId && !!docId && isComplete && docType === "prescription",
  });

  const notes = useQuery({
    queryKey: ["notes", patientId, { document_id: docId }],
    queryFn: () => api.get<{ notes: unknown[] }>(`/patients/${patientId}/notes?document_id=${docId}`),
    enabled: !!patientId && !!docId && isComplete,
  });

  const cultures = useQuery({
    queryKey: ["cultures", patientId, { document_id: docId }],
    queryFn: () =>
      api.get<{ cultures: unknown[] }>(`/patients/${patientId}/cultures?document_id=${docId}`),
    enabled: !!patientId && !!docId && isComplete && docType === "culture_report",
  });

  const queryMap: Record<string, { data: unknown; isLoading: boolean; error: Error | null }> = {
    blood_report: bloodWork,
    scan: scans,
    ecg: scans,
    prescription: medications,
    consultation: notes,
    culture_report: cultures,
  };

  const activeQuery = queryMap[docType];

  const isConsultation = docType === "consultation";

  return {
    type: docType,
    data: activeQuery?.data ?? null,
    isLoading: activeQuery?.isLoading ?? false,
    error: (activeQuery?.error as Error) ?? null,
    linkedNotes: isConsultation ? null : (notes.data ?? null),
    linkedNotesLoading: !isConsultation && (notes.isLoading ?? false),
  };
}

export function useFullDocument(patientId: string, documentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.get<{ document: Document }>(`/patients/${patientId}/documents/${documentId}`),
    enabled: !!patientId && !!documentId && enabled,
    staleTime: 30_000,
  });
}
