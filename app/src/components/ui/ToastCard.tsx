import { useEffect, useRef, useState } from "react";

interface ToastCardProps {
  children: React.ReactNode;
  exiting?: boolean;
  onExited?: () => void;
  onDismiss?: () => void;
}

export function ToastCard({ children, exiting, onExited, onDismiss }: ToastCardProps) {
  const [state, setState] = useState<"entering" | "visible" | "exiting">("entering");
  const swipeStart = useRef<{ x: number; time: number } | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setState("visible"));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (!exiting) return;
    setState("exiting");
    const t = setTimeout(() => onExited?.(), 320);
    return () => clearTimeout(t);
  }, [exiting, onExited]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    swipeStart.current = { x: e.clientX, time: Date.now() };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    if (dx > 0) {
      e.currentTarget.style.transition = "none";
      e.currentTarget.style.transform = `translateX(${dx}px)`;
    }
  }

  function handlePointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeStart.current) return
    swipeStart.current = null
    e.currentTarget.style.transition = 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)'
    e.currentTarget.style.transform = ''
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    const dt = Date.now() - swipeStart.current.time;
    const velocity = dt > 0 ? dx / dt : 0;
    swipeStart.current = null;

    if (dx > 80 || velocity > 0.5) {
      e.currentTarget.style.transition =
        "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)";
      e.currentTarget.style.transform = "translateX(200%)";
      setTimeout(() => onDismiss?.(), 200);
    } else {
      e.currentTarget.style.transition =
        "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)";
      e.currentTarget.style.transform = "";
      setTimeout(() => {
        if (e.currentTarget) {
          e.currentTarget.style.transition = "";
        }
      }, 200);
    }
  }

  const translateY =
    state === "visible" ? "translateY(0)" : "translateY(100%)";
  const opacity = state === "visible" ? 1 : 0;
  const transition =
    state === "exiting"
      ? "transform 200ms cubic-bezier(0.23, 1, 0.32, 1), opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)"
      : "transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms cubic-bezier(0.23, 1, 0.32, 1)";

  return (
    <div
      data-state={state}
      style={{ transform: translateY, opacity, transition }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {children}
    </div>
  );
}
