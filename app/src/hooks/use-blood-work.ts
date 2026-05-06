import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  BloodWorkCategory,
  BloodWorkAlert,
  TestDefinition,
  TestResult,
} from "@/types/api";

// Backend GET /patients/:pid/blood-work returns { categories: BloodWorkCategory[] }
interface BloodWorkResponse {
  categories: BloodWorkCategory[];
}

// Backend GET /patients/:pid/blood-work/alerts returns { alerts: BloodWorkAlert[] }
interface BloodWorkAlertsResponse {
  alerts: BloodWorkAlert[];
}

// Backend GET /patients/:pid/blood-work/:testId/trend returns { test_definition: TestDefinition; readings: TestResult[] }
interface BloodWorkTrendResponse {
  test_definition: TestDefinition;
  readings: TestResult[];
}

export function useBloodWork(patientId: string) {
  return useQuery({
    queryKey: ["blood-work", patientId],
    queryFn: () =>
      api.get<BloodWorkResponse>(`/patients/${patientId}/blood-work`),
    enabled: !!patientId,
  });
}

export function useBloodWorkAlerts(patientId: string) {
  return useQuery({
    queryKey: ["blood-work", "alerts", patientId],
    queryFn: () =>
      api.get<BloodWorkAlertsResponse>(`/patients/${patientId}/blood-work/alerts`),
    enabled: !!patientId,
  });
}

export function useBloodWorkTrend(patientId: string, testId: string) {
  return useQuery({
    queryKey: ["blood-work", "trend", patientId, testId],
    queryFn: () =>
      api.get<BloodWorkTrendResponse>(
        `/patients/${patientId}/blood-work/${testId}/trend`
      ),
    enabled: !!patientId && !!testId,
  });
}

export function useDeleteBloodWorkResult(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resultId: string) =>
      api.delete(`/patients/${patientId}/blood-work/${resultId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blood-work", patientId] });
    },
  });
}
