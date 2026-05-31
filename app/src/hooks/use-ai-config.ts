import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AIProvider {
  provider: string;
  has_key: boolean;
  source: "d1" | "env" | null;
  model: string | null;
}

export interface AIUseCase {
  use_case: string;
  provider: string;
  model: string;
}

export interface AIGateway {
  account_id: string | null;
  gateway_id: string | null;
  source: "d1" | "env" | null;
}

interface ProvidersResponse {
  providers: AIProvider[];
}

interface UseCasesResponse {
  use_cases: AIUseCase[];
}

interface UpdateProviderRequest {
  api_key: string;
  model: string;
}

interface UpdateUseCaseRequest {
  provider: string;
  model: string;
}

interface UpdateGatewayRequest {
  account_id: string;
  gateway_id: string;
}

export function useAIProviders() {
  return useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => api.get<ProvidersResponse>("/ai/providers"),
  });
}

export function useUpdateAIProvider(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProviderRequest) =>
      api.put<{ ok: boolean }>(`/ai/providers/${providerId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-providers"] });
    },
  });
}

export function useDeleteAIProvider(providerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/ai/providers/${providerId}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-providers"] });
    },
  });
}

export function useAIUseCases() {
  return useQuery({
    queryKey: ["ai-use-cases"],
    queryFn: () => api.get<UseCasesResponse>("/ai/use-cases"),
  });
}

export function useUpdateAIUseCase(useCaseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUseCaseRequest) =>
      api.put<{ ok: boolean }>(`/ai/use-cases/${useCaseId}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-use-cases"] });
    },
  });
}

export function useAIGateway() {
  return useQuery({
    queryKey: ["ai-gateway"],
    queryFn: () => api.get<AIGateway>("/ai/gateway"),
  });
}

export function useUpdateAIGateway() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateGatewayRequest) =>
      api.put<{ ok: boolean }>("/ai/gateway", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-gateway"] });
    },
  });
}
