import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { QuickAddKind } from "@/components/QuickAddModal";


const FAB_ACTIONS: { kind: QuickAddKind; label: string; color: string }[] = [
  { kind: "vital",      label: "Log Vital",        color: "#bc4a38" },
  { kind: "medication", label: "Add Medication",   color: "#2f6b5f" },
  { kind: "lab",        label: "Upload Lab",        color: "#6b9f58" },
  { kind: "note",       label: "Add Note",          color: "#7a5a8f" },
  { kind: "scan",       label: "Add Scan",          color: "#c9942b" },
  { kind: "document",   label: "Upload Documents",  color: "#3c382f" },
];

interface FloatingAddFabProps {
  onAction: (kind: QuickAddKind) => void;
}

export function FloatingAddFab({ onAction }: FloatingAddFabProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstPillRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      firstPillRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    function onGlobalAction(e: Event) {
      onAction((e as CustomEvent<QuickAddKind>).detail);
    }
    window.addEventListener("fh:quickadd-action", onGlobalAction);
    return () => window.removeEventListener("fh:quickadd-action", onGlobalAction);
  }, [onAction]);

  function handlePillClick(kind: QuickAddKind) {
    setOpen(false);
    onAction(kind);
  }

  // Reversed so the first action (vital) is nearest the FAB (bottom), last is furthest (top).
  const reversedActions = [...FAB_ACTIONS].reverse();

  return (
    <>
      {open && (
        <div
          data-testid="fab-backdrop"
          className="lg:hidden fixed inset-0 bg-black/20 z-40"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <div className={`fixed right-4 bottom-24 lg:bottom-6 lg:right-6 z-50 flex flex-col items-end gap-2${open ? "" : " pointer-events-none"}`}>
        {/* Action pills — rendered reversed so first action is closest to trigger */}
        <div className="flex flex-col items-end gap-2" style={{ transformOrigin: 'bottom right' }}>
          {reversedActions.map((action, idx) => {
            const isFirst = idx === reversedActions.length - 1;
            return (
              <button
                key={action.kind}
                ref={isFirst ? firstPillRef : undefined}
                type="button"
                tabIndex={open ? 0 : -1}
                onClick={() => handlePillClick(action.kind)}
                className="flex items-center gap-2 bg-white border border-cream-200 shadow-lift rounded-full px-4 py-2 text-sm font-medium text-ink transition-[transform,opacity] duration-200 ease-out-strong active:scale-[0.96]"
                style={{
                  transform: open ? "translateY(0) scale(1)" : "translateY(16px) scale(0.92)",
                  opacity: open ? 1 : 0,
                  transitionDelay: open ? `${(reversedActions.length - 1 - idx) * 40}ms` : `${idx * 30}ms`,
                  pointerEvents: open ? "auto" : "none",
                }}
                aria-hidden={!open}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: action.color }}
                  aria-hidden
                />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* FAB trigger */}
        <button
          ref={triggerRef}
          type="button"
          aria-label="Quick add"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((prev) => !prev)}
          className="h-14 rounded-full bg-teal-600 text-cream-50 shadow-lift flex items-center justify-center font-medium hover:bg-teal-700 active:scale-[0.94] overflow-hidden pointer-events-auto"
          style={{
            width: open ? "56px" : "112px",
            transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <span
            className="flex-shrink-0"
            style={{
              transform: open ? "rotate(45deg)" : "rotate(0deg)",
              transition: "transform 250ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
            aria-hidden
          >
            <Plus size={20} />
          </span>
          <span
            className="whitespace-nowrap"
            style={{
              maxWidth: open ? "0px" : "48px",
              opacity: open ? 0 : 1,
              marginLeft: open ? "0" : "8px",
              transition: "max-width 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 150ms cubic-bezier(0.23, 1, 0.32, 1), margin-left 250ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >Add</span>
        </button>
      </div>
    </>
  );
}
