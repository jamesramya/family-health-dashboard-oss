import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ScanFinding } from "@/types/api";

interface ScanFilters {
  scan_type?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

// Backend returns { scans: ScanFinding[] }
interface ScansResponse {
  scans: ScanFinding[];
}

// Backend returns { scan: ScanFinding }
interface ScanResponse {
  scan: ScanFinding;
}

export function useScans(patientId: string, filters: ScanFilters = {}) {
  return useQuery({
    queryKey: ["scans", patientId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.scan_type) params.set("scan_type", filters.scan_type);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.limit != null) params.set("limit", String(filters.limit));
      if (filters.offset != null) params.set("offset", String(filters.offset));
      const qs = params.toString();
      return api.get<ScansResponse>(
        `/patients/${patientId}/scans${qs ? `?${qs}` : ""}`
      );
    },
    enabled: !!patientId,
  });
}

export function useScan(patientId: string, scanId: string) {
  return useQuery({
    queryKey: ["scans", patientId, scanId],
    queryFn: () =>
      api.get<ScanResponse>(`/patients/${patientId}/scans/${scanId}`),
    enabled: !!patientId && !!scanId,
  });
}

export function useDeleteScan(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (scanId: string) =>
      api.delete(`/patients/${patientId}/scans/${scanId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scans", patientId] });
    },
  });
}
