import { useEffect, useRef, type RefObject } from 'react';
import { useIsoLayoutEffect } from './hooks';
import { keyCodeToMidi } from '../../src/core/input/keyboard-map';

/**
 * Computertastatur als Klavier (gleiche Belegung wie der Simulator der App).
 * Mehrere Demos auf der Seite: Die Tasten gehen an die Demo, die gerade am meisten im Bild ist.
 */
export interface KeyHandler {
  /** Basisoktave der unteren Buchstabenreihe (4 = C4) */
  octave: number;
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
  /** Leertaste und andere Nicht-Klaviertasten (z. B. Performance-Demo) */
  other?(code: string): boolean;
}

interface Entry {
  handler: () => KeyHandler;
  ratio: number;
}

const entries = new Map<symbol, Entry>();
const down = new Map<string, { owner: symbol; midi: number }>();

function owner(): [symbol, Entry] | null {
  let best: [symbol, Entry] | null = null;
  for (const e of entries) if (e[1].ratio > 0.25 && (!best || e[1].ratio > best[1].ratio)) best = e;
  return best;
}

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const o = owner();
    if (!o) return;
    const h = o[1].handler();
    if (h.other?.(e.code)) {
      e.preventDefault();
      return;
    }
    const midi = keyCodeToMidi(e.code, h.octave);
    if (midi === null) return;
    e.preventDefault();
    if (e.repeat || down.has(e.code)) return;
    down.set(e.code, { owner: o[0], midi });
    h.noteOn(midi, 0.75);
  });
  window.addEventListener('keyup', (e) => {
    const d = down.get(e.code);
    if (!d) return;
    down.delete(e.code);
    entries.get(d.owner)?.handler().noteOff(d.midi);
  });
  window.addEventListener('blur', () => {
    for (const [code, d] of down) {
      entries.get(d.owner)?.handler().noteOff(d.midi);
      down.delete(code);
    }
  });
}

/** Meldet eine Demo als Empfänger der Computertastatur an, solange sie sichtbar ist. */
export function useKeyboardInput(ref: RefObject<HTMLElement | null>, handler: KeyHandler): void {
  const latest = useRef(handler);
  useIsoLayoutEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    install();
    const el = ref.current;
    if (!el) return;
    const id = Symbol('demo');
    const entry: Entry = { handler: () => latest.current, ratio: 0 };
    entries.set(id, entry);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e) return;
        // Anteil am Viewport statt am Element: lange Abschnitte sollen nicht benachteiligt werden
        const vh = window.innerHeight || 1;
        entry.ratio = e.isIntersecting
          ? e.intersectionRect.height / Math.min(vh, e.boundingClientRect.height)
          : 0;
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      entries.delete(id);
    };
  }, [ref]);
}
