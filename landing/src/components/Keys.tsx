import { useMemo, useRef } from 'react';
import {
  computeKeyboardLayout,
  hitTestKey,
  type KeyboardLayout,
} from '../../../src/ui/canvas/keyboard-layout';
import { drawKeyboard, type KeyboardFrame } from '../../../src/ui/canvas/keyboard-renderer';
import { useCanvasLoop } from '../hooks';
import { wakeSound } from '../audio';

/**
 * Spielbare Klaviatur – zeichnet mit dem Canvas-Renderer der App (drawKeyboard) und
 * nimmt Maus/Touch wie in der App entgegen (tiefer klicken = lauter).
 */
export interface KeysProps {
  min: number;
  max: number;
  frame: (nowMs: number) => KeyboardFrame;
  onDown?: (midi: number, velocity: number) => void;
  onUp?: (midi: number) => void;
  /** Wird nach dem Zeichnen der Tasten aufgerufen (z. B. Funken) */
  overlay?: (ctx: CanvasRenderingContext2D, layout: KeyboardLayout, height: number) => void;
  className?: string;
  label: string;
}

export function Keys({ min, max, frame, onDown, onUp, overlay, className, label }: KeysProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const layoutRef = useRef<{ w: number; layout: KeyboardLayout } | null>(null);
  const held = useRef(new Map<number, number>());

  const layoutFor = (w: number) => {
    if (layoutRef.current?.w !== w) layoutRef.current = { w, layout: computeKeyboardLayout(w, min, max) };
    return layoutRef.current.layout;
  };

  useCanvasLoop(ref, (ctx, size, _dt, now) => {
    const layout = layoutFor(size.w);
    drawKeyboard(ctx, layout, size.h, frame(now));
    overlay?.(ctx, layout, size.h);
  });

  const handlers = useMemo(() => {
    const hit = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      const layout = layoutFor(r.width);
      const y = e.clientY - r.top;
      const midi = hitTestKey(layout, e.clientX - r.left, y, r.height);
      return { midi, velocity: Math.min(1, 0.35 + 0.65 * (y / r.height)) };
    };
    return {
      onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
        wakeSound();
        const { midi, velocity } = hit(e);
        if (midi === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current.set(e.pointerId, midi);
        onDown?.(midi, velocity);
      },
      onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
        const prev = held.current.get(e.pointerId);
        if (prev === undefined) return;
        const { midi, velocity } = hit(e);
        if (midi === null || midi === prev) return;
        onUp?.(prev);
        held.current.set(e.pointerId, midi);
        onDown?.(midi, velocity);
      },
      onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => {
        const prev = held.current.get(e.pointerId);
        if (prev === undefined) return;
        held.current.delete(e.pointerId);
        onUp?.(prev);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDown, onUp, min, max]);

  return (
    <canvas
      ref={ref}
      className={`keys ${className ?? ''}`}
      role="img"
      aria-label={label}
      {...handlers}
      onPointerCancel={handlers.onPointerUp}
    />
  );
}
