import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ShareLink {
  id: string;
  patient_ids: string;
  scopes: string;
  expires_at: string | null;
  created_at: string;
  link: string | null;
}

interface ShareLinksResponse {
  links: ShareLink[];
}

interface CreateShareLinkRequest {
  patient_ids: string[];
  expires_in_days: number | null;
  scopes?: string[];
}

interface CreateShareLinkResponse {
  id: string;
  token: string;
  link: string;
  expires_at: string | null;
}

export function useShareLinks() {
  return useQuery({
    queryKey: ["share-links"],
    queryFn: () => api.get<ShareLinksResponse>("/share-links"),
  });
}

export function useCreateShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateShareLinkRequest) =>
      api.post<CreateShareLinkResponse>("/share-links", data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["share-links"] });
    },
  });
}

export function useRevokeShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/share-links/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["share-links"] });
    },
  });
}
