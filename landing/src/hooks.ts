import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

const RM = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(RM);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia(RM).matches,
  );
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(RM).matches;
}

/** Wird true, sobald das Element in die Nähe des Viewports kommt (bleibt dann true). */
export function useNear(ref: RefObject<Element | null>, margin = '400px'): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setNear(true), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin, near]);
  return near;
}

/** Live-Sichtbarkeit (für Animationsschleifen, die außerhalb des Bildes pausieren sollen). */
export function useVisible(ref: RefObject<Element | null>, margin = '100px'): RefObject<boolean> {
  const visible = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        visible.current = !!e?.isIntersecting;
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, margin]);
  return visible;
}

export interface CanvasSize {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Canvas mit Geräte-Pixeldichte und einer Zeichenschleife, die nur läuft, solange das Canvas sichtbar ist.
 * `draw` bekommt einen Kontext in CSS-Pixeln.
 */
export function useCanvasLoop(
  ref: RefObject<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, size: CanvasSize, dt: number, now: number) => void,
): void {
  const latest = useRef(draw);
  useLayoutEffect(() => {
    latest.current = draw;
  });
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const size: CanvasSize = { w: 0, h: 0, dpr: 1 };
    const resize = () => {
      // Layout-Größe (ohne CSS-Transformationen wie das Kippen der Bühne)
      size.dpr = Math.min(2, window.devicePixelRatio || 1);
      size.w = Math.max(1, canvas.clientWidth);
      size.h = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(size.w * size.dpr);
      canvas.height = Math.round(size.h * size.dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    let visible = false;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      latest.current(ctx, size, dt, now);
      raf = visible ? requestAnimationFrame(frame) : 0;
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = !!e?.isIntersecting;
        if (visible && !raf) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      },
      { rootMargin: '80px' },
    );
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [ref]);
}

/** Fortschritt 0..1, während ein hoher Abschnitt durch den Viewport scrollt (für Sticky-Szenen). */
export function scrollProgress(el: HTMLElement): number {
  const r = el.getBoundingClientRect();
  const total = r.height - window.innerHeight;
  if (total <= 0) return r.top < 0 ? 1 : 0;
  return Math.min(1, Math.max(0, -r.top / total));
}
