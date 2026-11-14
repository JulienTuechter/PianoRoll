/** Gemeinsame Bühnen-Bausteine der Landingpage: Demo-Stück, Tastatur-Frames, Leucht-Zeichnungen. */
import { createDemoMidi } from '../../src/core/demo/demo-song';
import { loadMidiFile } from '../../src/core/midi-file-loader/load';
import { buildMeasures, TempoMap, type MeasureInfo } from '../../src/core/note-event-model/tempo-map';
import type { NoteEvent, Song } from '../../src/core/note-event-model/types';
import type { KeyboardFrame } from '../../src/ui/canvas/keyboard-renderer';
import { handColors, rgba } from '../../src/ui/theme';

export interface DemoSong {
  song: Song;
  notes: NoteEvent[];
  measures: MeasureInfo[];
  tempoMap: TempoMap;
  maxDurationSec: number;
}

let cached: DemoSong | null = null;

/** Das Demo-Stück der App (C-Dur, 8 Takte, beide Hände) im internen Notenmodell. */
export function demoSong(): DemoSong {
  if (cached) return cached;
  const song = loadMidiFile(createDemoMidi({ right: 'Right hand', left: 'Left hand' }), { title: 'Demo' });
  const tempoMap = new TempoMap(song.ppq, song.tempos);
  const endTick = Math.max(...song.notes.map((n) => n.startTick + (n.durationTicks ?? 0)));
  const measures = buildMeasures(song.ppq, song.timeSignatures, tempoMap, endTick - 1);
  const maxDurationSec = Math.max(...song.notes.map((n) => n.durationSec));
  cached = { song, notes: song.notes, measures, tempoMap, maxDurationSec };
  return cached;
}

/** Leerer Tastatur-Frame für den Renderer der App */
export function keyboardFrame(nowMs: number, patch: Partial<KeyboardFrame> = {}): KeyboardFrame {
  return {
    pressed: new Map(),
    sustained: new Set(),
    active: new Map(),
    labels: null,
    expected: null,
    satisfied: new Set(),
    judgements: new Map(),
    flashes: new Map(),
    hint: false,
    nowMs,
    ghost: null,
    ghostSoft: false,
    scalePcs: null,
    approaching: null,
    ...patch,
  };
}

export const handColor = (hand: 'left' | 'right'): string =>
  hand === 'right' ? handColors.right : handColors.left;

/** Leuchtende Notenkapsel: weicher Schein + heller Kern (additiv). */
export function glowCapsule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  alpha = 1,
  glow = 1,
): void {
  const r = Math.min(w / 2, 8);
  // Lichthof-Breite unabhängig von der Kapselbreite, sonst werden breite Noten zu Kästen
  const g1 = Math.min(w, 14) * 0.6;
  const g2 = Math.min(w, 14) * 0.22;
  ctx.globalAlpha = 0.16 * alpha * glow;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - g1, y - g1, w + g1 * 2, h + g1 * 2, r + g1);
  ctx.fill();
  ctx.globalAlpha = 0.32 * alpha * glow;
  ctx.beginPath();
  ctx.roundRect(x - g2, y - g2, w + g2 * 2, h + g2 * 2, r + g2);
  ctx.fill();
  ctx.globalAlpha = 0.95 * alpha;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  // heller Kern
  ctx.globalAlpha = 0.55 * alpha;
  ctx.fillStyle = '#fff6e8';
  ctx.beginPath();
  ctx.roundRect(x + w * 0.3, y + 2, w * 0.4, Math.max(0, h - 4), Math.min(r * 0.4, w * 0.2));
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Glühende Anschlagslinie in Glut-Farbe */
export function strikeLine(ctx: CanvasRenderingContext2D, y: number, width: number, intensity = 1): void {
  const g = ctx.createLinearGradient(0, y - 18, 0, y + 2);
  g.addColorStop(0, rgba('#fe6a00', 0));
  g.addColorStop(0.8, rgba('#fe6a00', 0.35 * intensity));
  g.addColorStop(1, rgba('#ffd9a8', 0.9 * intensity));
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 18, width, 20);
}

export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
