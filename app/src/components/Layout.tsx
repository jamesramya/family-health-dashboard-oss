import { useEffect, useState } from "react";
import { Outlet, Navigate, Link } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth-context";
import { useUploadQueue } from "@/contexts/upload-queue";
import { Check, X, AlertTriangle } from "lucide-react";
import { FloatingAddFab } from "@/components/FloatingAddFab";
import { QuickAddModal, type QuickAddKind } from "@/components/QuickAddModal";
import { Spinner } from "@/components/ui/Spinner";
import { ToastCard } from "@/components/ui/ToastCard";

interface AutoDismissToastProps {
  id: string;
  status: string;
  onDismiss: (id: string) => void;
  children: React.ReactNode;
}

function AutoDismissToast({ id, status, onDismiss, children }: AutoDismissToastProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (status !== "done" && status !== "error") return;
    const delay = status === "done" ? 3500 : 6000;
    const t = setTimeout(() => setExiting(true), delay);
    return () => clearTimeout(t);
  }, [id, status]);

  function handleExited() {
    onDismiss(id);
  }

  return (
    <ToastCard exiting={exiting} onExited={handleExited} onDismiss={() => onDismiss(id)}>
      {children}
    </ToastCard>
  );
}

export function Layout() {
  const { user, isLoading } = useAuth();
  const { uploads, dismiss } = useUploadQueue();
  const [quickAddKind, setQuickAddKind] = useState<QuickAddKind | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-cream-50 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>

      {uploads.length > 0 && (
        <div className="fixed bottom-20 lg:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full">
          {uploads.map((u) => (
            <AutoDismissToast key={u.id} id={u.id} status={u.status} onDismiss={dismiss}>
              <div
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-card text-sm font-medium border bg-white ${
                  u.status === "uploading" ? "border-cream-200 text-ink-soft" :
                  u.status === "done" ? "border-sage-100 text-sage-600" :
                  u.status === "duplicate" ? "border-amber-100 text-amber-600" :
                  "border-rose-100 text-rose-600"
                }`}
              >
                {u.status === "uploading" && <Spinner size="sm" />}
                {u.status === "done" && <Check size={18} className="text-sage-600 flex-shrink-0" aria-hidden />}
                {u.status === "error" && <X size={18} className="text-rose-500 flex-shrink-0" aria-hidden />}
                {u.status === "duplicate" && <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" aria-hidden />}
                {u.status !== "duplicate" && (
                  <span className="truncate flex-1">
                    {u.status === "uploading" && `Uploading ${u.filename}…`}
                    {u.status === "done" && `${u.filename} uploaded`}
                    {u.status === "error" && (u.error ?? "Upload failed")}
                  </span>
                )}
                {u.status === "duplicate" && (
                  <span className="truncate flex-1">
                    Already uploaded{u.existingDocTitle ? ` · ${u.existingDocTitle}` : ""}
                    {" — "}
                    <Link to="/documents" className="underline" onClick={() => dismiss(u.id)}>View</Link>
                  </span>
                )}
                {u.status !== "uploading" && (
                  <button
                    onClick={() => dismiss(u.id)}
                    className="flex-shrink-0 text-ink-faint hover:text-ink-muted min-h-[32px] min-w-[32px] flex items-center justify-center"
                    aria-label="Dismiss"
                  >
                    <X size={16} aria-hidden />
                  </button>
                )}
              </div>
            </AutoDismissToast>
          ))}
        </div>
      )}

      <FloatingAddFab onAction={setQuickAddKind} />
      <QuickAddModal kind={quickAddKind} onClose={() => setQuickAddKind(null)} />
    </>
  );
}
