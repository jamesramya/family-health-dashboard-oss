import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface OAuthClientItem {
  id: string;
  client_name: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
}

export interface OAuthAccessLogEntry {
  id: string;
  oauth_client_id: string;
  oauth_client_name: string;
  patient_id: string | null;
  patient_name: string | null;
  tool: string;
  kind: string;
  status_code: number;
  error_code: string | null;
  ip: string | null;
  created_at: string;
}

interface AccessLogParams {
  clientId?: string;
  patientId?: string;
  page?: number;
}

interface AccessLogResponse {
  entries: OAuthAccessLogEntry[];
  total: number;
}

export function useOAuthClients() {
  return useQuery({
    queryKey: ["oauth-clients"],
    queryFn: async () => {
      const res = await api.get<{ clients: OAuthClientItem[] }>("/user/oauth-clients");
      return res.clients;
    },
    staleTime: 30_000,
  });
}

export function useRevokeOAuthClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => api.delete<void>(`/user/oauth-clients/${clientId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oauth-clients"] });
      queryClient.invalidateQueries({ queryKey: ["oauth-access-log"] });
    },
  });
}

export function useAccessLog({ clientId, patientId, page = 0 }: AccessLogParams = {}) {
  return useQuery({
    queryKey: ["oauth-access-log", { clientId, patientId, page }],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (clientId) params.set("clientId", clientId);
      if (patientId) params.set("patientId", patientId);
      const qs = params.toString();
      return api.get<AccessLogResponse>(`/user/oauth-clients/log${qs ? "?" + qs : ""}`);
    },
    staleTime: 15_000,
  });
}
