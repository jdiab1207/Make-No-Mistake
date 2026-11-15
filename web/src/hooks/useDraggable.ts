"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Pos = { x: number; y: number };

/**
 * Classic title-bar drag for NT windows. Attach onPointerDown to the title bar.
 */
export function useDraggable(initial: Pos = { x: 0, y: 0 }) {
  const [pos, setPos] = useState<Pos>(initial);
  const dragging = useRef(false);
  const origin = useRef({ px: 0, py: 0, x: 0, y: 0 });

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".title-bar-controls")) return;
      dragging.current = true;
      origin.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    [pos.x, pos.y],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.x + (e.clientX - origin.current.px),
        y: origin.current.y + (e.clientY - origin.current.py),
      });
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return {
    pos,
    style: { transform: `translate(${pos.x}px, ${pos.y}px)` } as CSSProperties,
    onPointerDown,
  };
}
