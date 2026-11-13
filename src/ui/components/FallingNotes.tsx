import { useCallback, useRef } from 'react';
import { speller } from '../../core/key-detection/key';
import { firstNoteIndexAtOrAfter } from '../../core/note-event-model/notes';
import type { TrailNote } from '../../core/free-play/note-trail';
import { drawFallingNotes, drawRisingNotes } from '../canvas/falling-notes-renderer';
import type { KeyboardLayout } from '../canvas/keyboard-layout';
import { layoutForWidth } from '../canvas/layout-cache';
import { ParticleSystem } from '../canvas/particles';
import { freeTrail } from '../harmony-service';
import { useCanvasLoop } from '../hooks/useCanvasLoop';
import { getWaitEngine, live, transport } from '../runtime';
import { useApp } from '../store/app-store';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { handColors } from '../theme';

let spellCache: { key: unknown; fn: (pc: number) => string } | null = null;
function spellFor(key: Parameters<typeof speller>[0]): (pc: number) => string {
  if (spellCache?.key !== key) spellCache = { key, fn: speller(key) };
  return spellCache.fn;
}

let idCache: { group: unknown; ids: Set<string> } = { group: null, ids: new Set() };

/** Zustand der Partikeleffekte (pro Komponente) */
interface FxState {
  ps: ParticleSystem;
  lastMs: number;
  prevPos: number;
  seen: WeakSet<TrailNote>;
}

function keyCenter(layout: KeyboardLayout, midi: number): { x: number; w: number } | null {
  const k = layout.byMidi[midi];
  return k ? { x: k.x + k.w / 2, w: k.w } : null;
}

export function FallingNotes() {
  const fx = useRef<FxState>({
    ps: new ParticleSystem(),
    lastMs: 0, // erster Frame: dt = 0
    prevPos: 0,
    seen: new WeakSet(),
  });

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const s = useSettings.getState();
    const layout = layoutForWidth(w);
    const now = performance.now();
    const f = fx.current;
    const dt = f.lastMs === 0 ? 0 : (now - f.lastMs) / 1000;
    f.lastMs = now;

    // Ohne Stück: freies Spiel – gespielte Noten steigen nach oben
    if (!useApp.getState().song) {
      drawRisingNotes(ctx, layout, h, {
        nowMs: now,
        windowSec: Math.max(4, s.fallWindowSec * 1.5),
        notes: freeTrail.notes,
        marks: freeTrail.marks,
        splitPoint: s.splitPoint,
        showNoteNames: s.showNoteNames,
        spell: spellFor(useHarmony.getState().key),
      });
      if (s.particles) {
        for (const n of freeTrail.notes) {
          const c = keyCenter(layout, n.midi);
          if (!c) continue;
          const color = n.midi < s.splitPoint ? handColors.left : handColors.right;
          if (!f.seen.has(n)) {
            f.seen.add(n);
            // nur frische Anschläge zünden (nicht beim Umschalten auf alte Spur)
            if (now - n.startMs < 200) f.ps.burst(c.x, h, color, 18 + Math.round(18 * n.velocity));
          }
          if (n.endMs === null) f.ps.sparkle(c.x, h, c.w * 0.7, color, 1);
        }
      }
      finishFx(ctx, f, dt, s.particles);
      return;
    }

    const engine = getWaitEngine();
    const group = engine?.currentGroup ?? null;
    if (idCache.group !== group) idCache = { group, ids: new Set(group?.notes.map((n) => n.id) ?? []) };
    const pos = transport.position;
    const ci = live.countIn;
    const hideBeforeSec = ci && pos < ci.startSec ? ci.startSec : null;
    drawFallingNotes(ctx, layout, h, {
      positionSec: pos,
      windowSec: s.fallWindowSec,
      notes: live.notes,
      maxDurationSec: live.maxDurationSec,
      measures: live.measures,
      showNoteNames: s.showNoteNames,
      practiced: live.practiced,
      currentIds: group ? idCache.ids : null,
      waiting: transport.waiting,
      hideBeforeSec,
      loop: live.loop,
      beginner: s.beginnerMode,
    });

    if (s.particles && transport.state === 'playing') {
      const notes = live.notes;
      const jumped = pos < f.prevPos || pos - f.prevPos > 0.3;
      const loop = live.loop;
      const visible = (startSec: number) =>
        (hideBeforeSec === null || startSec >= hideBeforeSec - 1e-6) &&
        (!loop || (startSec >= loop.startSec - 1e-6 && startSec < loop.endSec - 1e-6));
      // Aufprall: Noten, deren Anfang in diesem Frame die Klaviatur erreicht hat
      if (!jumped) {
        for (let i = firstNoteIndexAtOrAfter(notes, f.prevPos + 1e-6); i < notes.length; i++) {
          const n = notes[i]!;
          if (n.startSec > pos) break;
          const c = keyCenter(layout, n.midi);
          if (c && visible(n.startSec))
            f.ps.burst(
              c.x,
              h,
              n.hand === 'right' ? handColors.right : handColors.left,
              16 + Math.round(16 * n.velocity),
            );
        }
      }
      // Funkenstrom, solange Noten klingen (beim Warten nicht, dann steht die Zeit)
      if (!transport.waiting) {
        for (let i = firstNoteIndexAtOrAfter(notes, pos - live.maxDurationSec); i < notes.length; i++) {
          const n = notes[i]!;
          if (n.startSec > pos) break;
          if (n.startSec + n.durationSec <= pos || !visible(n.startSec)) continue;
          const c = keyCenter(layout, n.midi);
          if (c && Math.random() < 0.7)
            f.ps.sparkle(c.x, h, c.w * 0.7, n.hand === 'right' ? handColors.right : handColors.left, 1);
        }
      }
    }
    f.prevPos = pos;
    finishFx(ctx, f, dt, s.particles);
  }, []);
  const ref = useCanvasLoop(draw);
  return <canvas ref={ref} className="falling-canvas" aria-label="Fallende Noten" />;
}

function finishFx(ctx: CanvasRenderingContext2D, f: FxState, dt: number, enabled: boolean): void {
  if (!enabled) {
    if (f.ps.count > 0) f.ps.clear();
    return;
  }
  f.ps.update(dt);
  f.ps.draw(ctx);
}
