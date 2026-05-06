import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/types/api";

export function useDashboard(patientId: string) {
  return useQuery({
    queryKey: ["dashboard", patientId],
    queryFn: () => api.get<DashboardSummary>(`/patients/${patientId}/dashboard/summary`),
    enabled: !!patientId,
  });
}
