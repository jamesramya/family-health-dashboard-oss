import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UserPreferences } from "@/contexts/PreferencesContext";

const KEY = ["user", "preferences"] as const;
const DEFAULTS: UserPreferences = { textSize: "normal", density: "comfortable", statusLanguage: "plain" };

export function useUserPreferences() {
  const qc = useQueryClient();
  const query = useQuery<UserPreferences>({
    queryKey: KEY,
    queryFn: async () => {
      try {
        return await api.get<UserPreferences>("/user/preferences");
      } catch {
        const raw = localStorage.getItem("fh-prefs");
        return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
      }
    },
    staleTime: 60_000,
  });

  async function setPref<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const next: UserPreferences = { ...(query.data ?? DEFAULTS), [key]: value };
    qc.setQueryData(KEY, next);
    localStorage.setItem("fh-prefs", JSON.stringify(next));
    document.documentElement.dataset.size = next.textSize;
    document.documentElement.dataset.density = next.density;
    try { await api.patch("/user/preferences", { [key]: value }); }
    catch { /* server may not exist yet; localStorage + cache still authoritative */ }
  }

  return { prefs: query.data, isLoading: query.isLoading, setPref };
}
