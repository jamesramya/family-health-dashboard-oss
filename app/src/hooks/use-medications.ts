import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Medication, MedicationSchedule } from "@/types/api";

interface CreateMedicationRequest {
  brand_name: string;
  generic_name?: string;
  dosage?: string;
  form?: string;
  start_date?: string;
  end_date?: string;
  reason?: string;
  is_active?: number;
  notes?: string;
  schedules?: Array<{
    id?: string;
    time_of_day: string;
    meal_relation: string;
    dose_quantity: string | null;  // free text: "1 tablet", "5ml"; null = use med.dosage fallback
    specific_time?: string;
    instructions?: string;
    days_of_week?: string | null;
  }>;
}

// Backend returns { medications: Medication[] }
interface MedicationsResponse {
  medications: (Medication & { schedules: MedicationSchedule[] })[];
}

// Backend returns { medication: Medication & { schedules } }
interface MedicationResponse {
  medication: Medication & { schedules: MedicationSchedule[] };
}

export function useMedications(patientId: string, activeOnly = false) {
  return useQuery({
    queryKey: ["medications", patientId, { activeOnly }],
    queryFn: () => {
      const qs = activeOnly ? "?is_active=1" : "";
      return api.get<MedicationsResponse>(
        `/patients/${patientId}/medications${qs}`
      );
    },
    enabled: !!patientId,
  });
}

export function useMedication(patientId: string, medicationId: string) {
  return useQuery({
    queryKey: ["medications", patientId, medicationId],
    queryFn: () =>
      api.get<MedicationResponse>(
        `/patients/${patientId}/medications/${medicationId}`
      ),
    enabled: !!patientId && !!medicationId,
  });
}

export function useCreateMedication(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateMedicationRequest) =>
      api.post<MedicationResponse>(
        `/patients/${patientId}/medications`,
        data
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
    },
  });
}

export function useUpdateMedication(patientId: string, medicationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreateMedicationRequest>) =>
      api.put<MedicationResponse>(
        `/patients/${patientId}/medications/${medicationId}`,
        data
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
    },
  });
}

export function useDeleteMedication(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (medicationId: string) =>
      api.delete(`/patients/${patientId}/medications/${medicationId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
    },
  });
}

export function useDiscontinueMedication(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, end_date }: { id: string; note?: string; end_date?: string }) =>
      api.post(`/patients/${patientId}/medications/${id}/discontinue`, { note, end_date }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
    },
  });
}

export function useRestartMedication(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note, document_id }: { id: string; note?: string; document_id?: string }) =>
      api.post(`/patients/${patientId}/medications/${id}/restart`, { note, document_id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
    },
  });
}

export function useReviewMedication(patientId: string, documentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      extraction_index: number;
      decision: "added" | "skipped";
      reason?: string;
      medication_data?: Record<string, unknown>;
    }) => api.post(`/patients/${patientId}/documents/${documentId}/review-medication`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["medications", patientId] });
      void qc.invalidateQueries({ queryKey: ["document", documentId] });
      void qc.invalidateQueries({ queryKey: ["documents", patientId] });
    },
  });
}
