import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export interface UploadItem {
  id: string;
  filename: string;
  patientId: string;
  status: "uploading" | "done" | "error" | "duplicate";
  error?: string;
  existingDocId?: string;
  existingDocTitle?: string;
}

interface UploadQueueContextValue {
  uploads: UploadItem[];
  enqueue: (patientId: string, formData: FormData, filename: string) => void;
  dismiss: (id: string) => void;
}

const UploadQueueContext = createContext<UploadQueueContextValue | null>(null);

export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const qc = useQueryClient();

  const enqueue = useCallback(
    (patientId: string, formData: FormData, filename: string) => {
      const id = crypto.randomUUID();
      setUploads((prev) => [...prev, { id, filename, patientId, status: "uploading" }]);

      api
        .post(`/patients/${patientId}/documents/upload`, formData)
        .then(() => {
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, status: "done" } : u))
          );
          void qc.invalidateQueries({ queryKey: ["documents", patientId] });
        })
        .catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 409) {
            const d = err.data as { existing_id?: string; existing_title?: string } | undefined;
            setUploads((prev) =>
              prev.map((u) =>
                u.id === id
                  ? {
                      ...u,
                      status: "duplicate",
                      existingDocId: d?.existing_id,
                      existingDocTitle: d?.existing_title,
                    }
                  : u
              )
            );
            // Duplicate toasts stay until manually dismissed (no auto-dismiss)
          } else {
            const message = err instanceof Error ? err.message : "Upload failed";
            setUploads((prev) =>
              prev.map((u) => (u.id === id ? { ...u, status: "error", error: message } : u))
            );
          }
        });
    },
    [qc]
  );

  const dismiss = useCallback((id: string) => {
    setUploads((prev) => prev.filter((u) => u.id !== id));
  }, []);

  return (
    <UploadQueueContext.Provider value={{ uploads, enqueue, dismiss }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) throw new Error("useUploadQueue must be used inside UploadQueueProvider");
  return ctx;
}
