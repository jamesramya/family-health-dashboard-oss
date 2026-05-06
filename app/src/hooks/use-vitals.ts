import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VitalReading, VitalType } from "@/types/api";

interface VitalFilters {
  type?: VitalType;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

interface CreateVitalRequest {
  type: VitalType;
  measured_at: string;
  value_primary: number;
  value_secondary?: number;
  value_tertiary?: number;
  unit: string;
  context?: string;
  notes?: string;
  source?: string;
}

interface VitalsResponse {
  vitals: VitalReading[];
}

interface VitalResponse {
  vital: VitalReading;
}

export function useVitals(patientId: string, filters: VitalFilters = {}) {
  return useQuery({
    queryKey: ["vitals", patientId, filters],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.type) params.set("type", filters.type);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (filters.limit != null) params.set("limit", String(filters.limit));
      const qs = params.toString();
      return api.get<VitalsResponse>(
        `/patients/${patientId}/vitals${qs ? `?${qs}` : ""}`
      );
    },
    enabled: !!patientId,
  });
}

export function useLatestVitals(patientId: string) {
  return useQuery({
    queryKey: ["vitals", "latest", patientId],
    queryFn: () =>
      api.get<VitalsResponse>(
        `/patients/${patientId}/vitals/latest`
      ),
    enabled: !!patientId,
  });
}

export function useCreateVital(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateVitalRequest) =>
      api.post<VitalResponse>(`/patients/${patientId}/vitals`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vitals", patientId] });
    },
  });
}

export function useDeleteVital(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vitalId: string) =>
      api.delete(`/patients/${patientId}/vitals/${vitalId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vitals", patientId] });
    },
  });
}

interface UpdateVitalRequest {
  measured_at?: string;
  value_primary?: number;
  value_secondary?: number | null;
  unit?: string;
  context?: string | null;
  notes?: string | null;
}

export function useUpdateVital(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vitalId, data }: { vitalId: string; data: UpdateVitalRequest }) =>
      api.put<VitalResponse>(`/patients/${patientId}/vitals/${vitalId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["vitals", patientId] });
    },
  });
}
