import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { User } from "@/types/api";

interface UpdateMePayload {
  display_name?: string;
  email?: string;
}

interface UpdateMeResponse {
  user: Pick<User, "id" | "email" | "role" | "display_name">;
}

export function useUpdateMe() {
  return useMutation({
    mutationFn: (payload: UpdateMePayload) =>
      api.put<UpdateMeResponse>("/auth/me", payload),
  });
}
