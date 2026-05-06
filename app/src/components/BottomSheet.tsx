import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  heightPercent?: number;
  children: ReactNode;
  footer?: ReactNode;
  title?: string;
  eyebrow?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  heightPercent = 88,
  children,
  footer,
  title,
  eyebrow,
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartTime = useRef<number>(0);

  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"open" | "closed">("closed");

  useFocusTrap(panelRef, isOpen && visible, onClose);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => setState("open"));
    } else {
      setState("closed");
      const t = setTimeout(() => setVisible(false), 320);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  function handleDragStart(e: React.PointerEvent) {
    dragStartY.current = e.clientY;
    dragStartTime.current = Date.now();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panelRef.current) {
      panelRef.current.style.transition = "none";
    }
  }

  function handleDragMove(e: React.PointerEvent) {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    if (!panelRef.current) return;
    if (delta < 0) {
      const friction = Math.log(1 + Math.abs(delta)) * 3;
      panelRef.current.style.transform = `translateY(-${friction}px)`;
    } else {
      panelRef.current.style.transform = `translateY(${delta}px)`;
    }
  }

  function handleDragEnd(e: React.PointerEvent) {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = elapsed > 0 ? Math.abs(delta) / elapsed : 0;

    const panel = panelRef.current;
    if (!panel) return;

    const threshold = panel.offsetHeight * 0.4;

    if (delta > threshold || (delta > 0 && velocity > 0.4)) {
      panel.style.transition = "";
      panel.style.transform = "";
      onClose();
    } else {
      panel.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
      panel.style.transform = "translateY(0)";
      setTimeout(() => {
        panel.style.transition = "";
      }, 320);
    }
    dragStartY.current = null;
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        data-testid="bottomsheet-backdrop"
        data-sheet-backdrop
        data-state={state}
        onClick={onClose}
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-sheet-panel
        data-state={state}
        style={{ height: `${heightPercent}vh` }}
        className="absolute left-0 right-0 bottom-0 bg-cream-50 rounded-t-[28px] shadow-lift flex flex-col"
      >
        <button
          type="button"
          aria-label="Drag to dismiss"
          className="mx-auto mt-3 w-10 h-1.5 rounded-full bg-cream-300"
          onClick={onClose}
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
        />
        {(eyebrow || title) && (
          <div className="px-5 pt-2 pb-1">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-2xl font-semibold text-ink leading-tight mt-0.5">
                {title}
              </h2>
            )}
          </div>
        )}
        <div className={`flex-1 overflow-y-auto px-5 py-4${footer ? "" : " pb-[max(1rem,env(safe-area-inset-bottom))]"}`}>{children}</div>
        {footer && (
          <div className="border-t border-cream-200 px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] bg-cream-50/90 backdrop-blur safe-area-inset-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
