import { useEffect, useRef, useState } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm",
  cancelLabel = "Cancel", destructive = false,
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"open" | "closed">("closed");

  useEffect(() => {
    if (open) {
      setVisible(true);
      requestAnimationFrame(() => setState("open"));
    } else {
      setState("closed");
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = (typeof document !== "undefined"
      ? (document.activeElement as HTMLElement | null)
      : null);
    confirmBtnRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div
        data-confirm-backdrop
        data-state={state}
        className="fixed inset-0 bg-black/40"
        onClick={onCancel}
        aria-hidden
      />
      <div
        ref={dialogRef}
        data-confirm-panel
        data-state={state}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
        className="relative bg-white w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <h2 id="confirm-title" className="text-base font-semibold text-ink">{title}</h2>
        {message && <p id="confirm-message" className="mt-2 text-sm text-ink-soft">{message}</p>}
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            onClick={onCancel}
            className="min-h-[44px] px-4 rounded-xl bg-white border border-cream-300 text-sm font-medium text-ink-soft active:bg-cream-100 transition-[transform,background-color] duration-160 ease-out-strong active:scale-[0.97]"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold text-white transition-[transform,background-color] duration-160 ease-out-strong active:scale-[0.97] ${
              destructive ? "bg-rose-500 active:bg-rose-600" : "bg-teal-500 active:bg-teal-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
