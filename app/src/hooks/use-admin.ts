import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User, Patient } from "@/types/api";

interface CreateUserRequest {
  email: string;
  password: string;
  display_name: string;
  role: "admin" | "viewer";
}

interface UpdateUserRequest {
  display_name?: string;
  role?: "admin" | "viewer";
}

interface CreatePatientRequest {
  name: string;
  date_of_birth: string;
  gender?: string;
  blood_type?: string;
  allergies?: string[];
}

// Backend returns { users: User[] }
interface UsersResponse {
  users: User[];
}

// Backend returns { patients: Patient[] }
interface PatientsResponse {
  patients: Patient[];
}

// ---- Users ----

export function useUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => api.get<UsersResponse>("/admin/users"),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateUserRequest) =>
      api.post<{ user: User; temp_password: string }>("/admin/users", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useUpdateUser(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserRequest) =>
      api.put<{ user: User }>(`/admin/users/${userId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.delete(`/admin/users/${userId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useResetUserPassword(userId: string) {
  return useMutation({
    mutationFn: (newPassword: string) =>
      api.post(`/admin/users/${userId}/reset-pw`, {
        new_password: newPassword,
      }),
  });
}

// ---- Patients ----

export function usePatients() {
  return useQuery({
    queryKey: ["patients"],
    queryFn: () => api.get<PatientsResponse>("/patients"),
  });
}

/** Returns the first patient's ID and loading state — used as the default across all single-patient pages. */
export function useDefaultPatientId(): { patientId: string | undefined; isLoading: boolean } {
  const { data, isLoading } = usePatients();
  return { patientId: data?.patients?.[0]?.id, isLoading };
}

export function usePatient(patientId: string) {
  return useQuery({
    queryKey: ["patients", patientId],
    queryFn: () => api.get<{ patient: Patient }>(`/patients/${patientId}`),
    enabled: !!patientId,
  });
}

export function useCreatePatient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePatientRequest) =>
      api.post<{ patient: Patient }>("/patients", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}

export function useUpdatePatient(patientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CreatePatientRequest>) =>
      api.put<{ patient: Patient }>(`/patients/${patientId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["patients", patientId] });
    },
  });
}

// ---- Data purge ----

export function usePurgePatientData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patientId: string) =>
      api.delete(`/patients/${patientId}/purge`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
