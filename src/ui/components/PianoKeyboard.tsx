import { useCallback, useRef } from 'react';
import { firstNoteIndexAtOrAfter } from '../../core/note-event-model/notes';
import type { Hand } from '../../core/note-event-model/types';
import { labelForMidi } from '../../core/input/keyboard-map';
import { hitTestKey } from '../canvas/keyboard-layout';
import { drawKeyboard } from '../canvas/keyboard-renderer';
import { layoutForWidth } from '../canvas/layout-cache';
import { useCanvasLoop } from '../hooks/useCanvasLoop';
import { harmonyLive } from '../harmony-service';
import { getEngine, getWaitEngine, hub, live, transport } from '../runtime';
import { speller } from '../../core/key-detection/key';
import { useHarmony } from '../store/harmony-store';
import { useSettings } from '../store/settings';
import { useT } from '../i18n';

const active = new Map<number, Hand>();
const approaching = new Map<number, { hand: Hand; prox: number; label: string }>();
/** Anfängermodus: so lange vorher leuchtet die Zieltaste auf (Songsekunden) */
const APPROACH_SEC = 1.2;
let spellCache: { key: unknown; fn: (pc: number) => string } | null = null;
const noJudgements = new Map<number, never>();
const noneSatisfied = new Set<number>();
let labelCache: { key: string; map: Map<number, string> } | null = null;

function simulatorLabels(octave: number, layout: 'de' | 'en'): Map<number, string> {
  const key = `${octave}-${layout}`;
  if (labelCache?.key === key) return labelCache.map;
  const map = new Map<number, string>();
  for (let m = 21; m <= 108; m++) {
    const l = labelForMidi(m, octave, layout);
    if (l) map.set(m, l);
  }
  labelCache = { key, map };
  return map;
}

/** Klaviatur-Canvas: zeigt gedrückte und laut Stück klingende Tasten, Maus-/Touch-Eingabe als Simulator. */
export function PianoKeyboard() {
  const t = useT();
  const pointerNotes = useRef(new Map<number, number>()); // pointerId → midi

  const draw = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const layout = layoutForWidth(w);
    const pos = transport.position;
    const engine = getEngine();
    const wait = getWaitEngine();
    const ci = live.countIn;
    const hideBefore = ci && pos < ci.startSec ? ci.startSec : -Infinity;
    active.clear();
    const notes = live.notes;
    for (let i = firstNoteIndexAtOrAfter(notes, pos - live.maxDurationSec); i < notes.length; i++) {
      const n = notes[i]!;
      if (n.startSec > pos) break;
      if (n.startSec + n.durationSec <= pos || n.startSec < hideBefore) continue;
      // Im Wait-Modus zeigt die Klaviatur für die geübte Hand nur die Erwartung, nicht das „Mitklingen“
      if (wait && live.practiced && (live.practiced === 'both' || live.practiced === n.hand)) continue;
      active.set(n.midi, n.hand);
    }
    const s = useSettings.getState();
    const group = wait?.currentGroup ?? null;
    // Anfängermodus: gleich zu spielende Tasten mit Notennamen
    approaching.clear();
    if (s.beginnerMode && notes.length > 0) {
      const key = useHarmony.getState().songKey;
      if (spellCache?.key !== key) spellCache = { key, fn: speller(key) };
      const spell = spellCache.fn;
      const loop = live.loop;
      // inkl. Noten genau auf der Position (Wait-Modus wartet auf ihrem Anfang)
      for (let i = firstNoteIndexAtOrAfter(notes, pos - 1e-6); i < notes.length; i++) {
        const n = notes[i]!;
        if (n.startSec > pos + APPROACH_SEC) break;
        if (n.startSec < pos - 1e-6) continue;
        if (n.startSec < hideBefore) continue;
        if (live.practiced && live.practiced !== 'both' && live.practiced !== n.hand) continue;
        if (loop && (n.startSec >= loop.endSec || n.startSec < loop.startSec)) continue;
        const prox = Math.min(1, 1 - (n.startSec - pos) / APPROACH_SEC);
        const prev = approaching.get(n.midi);
        if (!prev || prev.prox < prox)
          approaching.set(n.midi, { hand: n.hand, prox, label: spell(n.midi % 12) });
      }
    }
    drawKeyboard(ctx, layout, h, {
      pressed: hub.pressed,
      sustained: hub.sustained,
      active,
      // Erwartung erst anzeigen, wenn die Gruppe in Reichweite ist (sonst „leuchtet“ sie sekundenlang vorher)
      expected: group && pos >= group.startSec - 0.6 ? group.expected : null,
      satisfied: wait?.satisfied ?? noneSatisfied,
      judgements: engine?.keyJudgements ?? noJudgements,
      flashes: live.flashes,
      hint: wait?.hint ?? false,
      nowMs: performance.now(),
      approaching: approaching.size > 0 ? approaching : null,
      ghost: harmonyLive.ghost ?? harmonyLive.autoGhost,
      ghostSoft: harmonyLive.ghost === null,
      scalePcs: harmonyLive.scalePcs,
      labels: s.keyboardLabels === 'off' ? null : simulatorLabels(s.simulatorOctave, s.keyboardLabels),
    });
  }, []);
  const canvasRef = useCanvasLoop(draw);

  const midiAt = (e: React.PointerEvent<HTMLCanvasElement>): { midi: number | null; velocity: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = hitTestKey(layoutForWidth(rect.width), x, y, rect.height);
    // weiter unten angeschlagen = lauter
    return { midi, velocity: Math.min(1, 0.35 + 0.65 * (y / rect.height)) };
  };

  const press = (pointerId: number, midi: number, velocity: number, timeMs: number) => {
    pointerNotes.current.set(pointerId, midi);
    hub.emit({ type: 'noteon', midi, velocity, timeMs, source: 'pointer' });
  };
  const release = (pointerId: number, timeMs: number) => {
    const midi = pointerNotes.current.get(pointerId);
    if (midi === undefined) return;
    pointerNotes.current.delete(pointerId);
    // Andere Pointer könnten dieselbe Taste halten
    if (![...pointerNotes.current.values()].includes(midi))
      hub.emit({ type: 'noteoff', midi, timeMs, source: 'pointer' });
  };

  return (
    <canvas
      ref={canvasRef}
      className="keyboard-canvas"
      aria-label={t.stage.keyboard}
      onPointerDown={(e) => {
        const { midi, velocity } = midiAt(e);
        if (midi === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press(e.pointerId, midi, velocity, e.timeStamp);
      }}
      onPointerMove={(e) => {
        if (!pointerNotes.current.has(e.pointerId)) return;
        const { midi, velocity } = midiAt(e);
        const current = pointerNotes.current.get(e.pointerId);
        if (midi === null || midi === current) return;
        release(e.pointerId, e.timeStamp); // Glissando
        press(e.pointerId, midi, velocity, e.timeStamp);
      }}
      onPointerUp={(e) => release(e.pointerId, e.timeStamp)}
      onPointerCancel={(e) => release(e.pointerId, e.timeStamp)}
    />
  );
}
