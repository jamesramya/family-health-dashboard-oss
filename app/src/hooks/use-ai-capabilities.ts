import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AICapabilities {
  google: boolean;
  openai: boolean;
  anthropic: boolean;
  deepgram: boolean;
}

export function useAICapabilities() {
  return useQuery({
    queryKey: ["ai-capabilities"],
    queryFn: () => api.get<AICapabilities>("/ai/capabilities"),
    staleTime: 5 * 60 * 1000,
  });
}
