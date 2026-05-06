import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CultureResult } from "@/types/api";

interface CulturesResponse {
  cultures: CultureResult[];
}

export function useCultures(patientId: string) {
  return useQuery({
    queryKey: ["cultures", patientId],
    queryFn: () => api.get<CulturesResponse>(`/patients/${patientId}/cultures`),
    enabled: !!patientId,
  });
}

export function useCulturesByDocument(patientId: string, documentId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cultures", patientId, { document_id: documentId }],
    queryFn: () =>
      api.get<CulturesResponse>(`/patients/${patientId}/cultures?document_id=${documentId}`),
    enabled: !!patientId && !!documentId && enabled,
  });
}
