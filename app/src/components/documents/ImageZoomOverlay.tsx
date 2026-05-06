import { useRef, useState } from "react";
import { Minus, RotateCcw, Plus } from "lucide-react";

interface Props {
  src: string;
  alt: string;
}

export function ImageZoomOverlay({ src, alt }: Props) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [animated, setAnimated] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastPinchDist = useRef<number | null>(null);
  const panStart = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  function animateTo(newTransform: { scale: number; x: number; y: number }) {
    setAnimated(true);
    setTransform(newTransform);
    setTimeout(() => setAnimated(false), 220);
  }

  function clampXY(x: number, y: number, scale: number): { x: number; y: number } {
    if (scale <= 1) return { x: 0, y: 0 };
    const container = containerRef.current;
    if (!container) return { x, y };
    const { width, height } = container.getBoundingClientRect();
    const maxX = (width * (scale - 1)) / 2;
    const maxY = (height * (scale - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.current.size === 1) {
      // Double-tap detection — must come before pan init
      const now = Date.now();
      if (lastTap.current && now - lastTap.current.time < 300) {
        // Double tap fired
        const currentScale = transform.scale;
        if (currentScale > 1) {
          animateTo({ scale: 1, x: 0, y: 0 });
        } else {
          animateTo({ scale: 2.5, x: 0, y: 0 });
        }
        lastTap.current = null;
        panStart.current = null;
        return;
      } else {
        lastTap.current = { time: now, x: e.clientX, y: e.clientY };
      }

      // Pan init — only when zoomed in
      if (transform.scale > 1) {
        panStart.current = {
          x: e.clientX,
          y: e.clientY,
          tx: transform.x,
          ty: transform.y,
        };
      }
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pointers = Array.from(activePointers.current.values());

    if (pointers.length === 2) {
      // Pinch — no transition during gesture
      const dist = Math.hypot(
        pointers[1].x - pointers[0].x,
        pointers[1].y - pointers[0].y
      );
      if (lastPinchDist.current !== null) {
        const ratio = dist / lastPinchDist.current;
        setTransform((t) => ({
          ...t,
          scale: Math.min(4, Math.max(0.5, t.scale * ratio)),
        }));
      }
      lastPinchDist.current = dist;
    } else if (pointers.length === 1 && panStart.current && transform.scale > 1) {
      // Single-finger pan
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setTransform((t) => ({
        ...t,
        x: panStart.current!.tx + dx,
        y: panStart.current!.ty + dy,
      }));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) {
      lastPinchDist.current = null;
    }

    const wasPanning = panStart.current !== null && activePointers.current.size === 0;
    if (activePointers.current.size === 0) {
      panStart.current = null;
    }
    // When going from 2→1 fingers, don't start a new pan — user must re-place finger
    if (activePointers.current.size === 1) {
      panStart.current = null;
    }

    // Clamp after pinch or pan ends
    if (wasPanning || activePointers.current.size === 0) {
      setTransform((t) => {
        const clamped = clampXY(t.x, t.y, t.scale);
        if (clamped.x === t.x && clamped.y === t.y) return t;
        setAnimated(true);
        setTimeout(() => setAnimated(false), 220);
        return { ...t, ...clamped };
      });
    }
  }

  return (
    <div className="relative w-full h-full bg-cream-100">
      <div
        ref={containerRef}
        className="overflow-hidden w-full h-full flex items-center justify-center touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={src}
          alt={alt}
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: animated
              ? "transform 200ms cubic-bezier(0.23, 1, 0.32, 1)"
              : "none",
            transformOrigin: "center center",
          }}
          className="max-w-full max-h-full object-contain pointer-events-none select-none"
        />
      </div>
      <div className="absolute bottom-4 right-4 z-10 flex gap-0 bg-black/20 backdrop-blur-sm rounded-xl p-1">
        <button
          aria-label="Zoom out"
          disabled={transform.scale <= 0.5}
          onClick={() =>
            animateTo({
              scale: Math.max(0.5, transform.scale - 0.25),
              x: 0,
              y: 0,
            })
          }
          className="w-11 h-11 rounded-lg flex items-center justify-center text-white hover:bg-white/20 active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus size={18} />
        </button>
        <button
          aria-label="Reset zoom"
          onClick={() => animateTo({ scale: 1, x: 0, y: 0 })}
          className="w-11 h-11 rounded-lg flex items-center justify-center text-white hover:bg-white/20 active:scale-[0.94]"
        >
          <RotateCcw size={18} />
        </button>
        <button
          aria-label="Zoom in"
          disabled={transform.scale >= 4}
          onClick={() =>
            animateTo({
              scale: Math.min(4, transform.scale + 0.25),
              x: 0,
              y: 0,
            })
          }
          className="w-11 h-11 rounded-lg flex items-center justify-center text-white hover:bg-white/20 active:scale-[0.94] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
