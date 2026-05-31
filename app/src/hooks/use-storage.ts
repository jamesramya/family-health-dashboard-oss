import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface StorageUsage {
  total_bytes: number;
  quota_bytes: number;
  by_category: {
    documents: number;
    scans: number;
    photos: number;
  };
}

export function useStorageUsage() {
  return useQuery({
    queryKey: ["storage-usage"],
    queryFn: () => api.get<StorageUsage>("/storage/usage"),
  });
}

export async function exportData(): Promise<void> {
  const blob = await api.blob("/account/export");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `family-health-export-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
