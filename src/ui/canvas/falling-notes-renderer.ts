import type { TrailMark, TrailNote } from '../../core/free-play/note-trail';
import { firstNoteIndexAtOrAfter, midiToName } from '../../core/note-event-model/notes';
import type { MeasureInfo } from '../../core/note-event-model/tempo-map';
import type { Hand, NoteEvent } from '../../core/note-event-model/types';
import { handColors, rgba, theme } from '../theme';

/** Notenfarbe als CSS-Farbe; ohne Angabe gelten die Handfarben */
export type NoteColorFn = (midi: number, hand: Hand) => string;
const byHand: NoteColorFn = (_m, hand) => (hand === 'right' ? handColors.right : handColors.left);
import type { KeyboardLayout } from './keyboard-layout';

export interface FallingFrame {
  positionSec: number;
  /** Wie viele Sekunden (Songzeit) oberhalb der Klaviatur sichtbar sind */
  windowSec: number;
  notes: readonly NoteEvent[];
  maxDurationSec: number;
  measures: readonly MeasureInfo[];
  showNoteNames: boolean;
  /** Wait-Modus: geübte Hand(e); andere Noten werden gedimmt. null = alles normal */
  practiced: 'both' | 'left' | 'right' | null;
  /** IDs der Noten der aktuell erwarteten Gruppe (werden hervorgehoben) */
  currentIds: ReadonlySet<string> | null;
  /** Wartet die Zeit gerade auf Eingabe? */
  waiting: boolean;
  /** Während des Count-ins: Noten vor diesem Zeitpunkt ausblenden */
  hideBeforeSec: number | null;
  /** Loop-Grenzen (Songzeit) */
  loop: { startSec: number; endSec: number } | null;
  /** Anfängermodus: Führungsstrahlen von kommenden Noten zur Taste */
  beginner: boolean;
  color?: NoteColorFn;
}

/** Ist die Note in diesem Frame sichtbar (Count-in, Loop) und wie stark gedimmt? */
export function noteVisibility(
  n: NoteEvent,
  f: FallingFrame,
): { hidden: boolean; alpha: number; accompaniment: boolean; playing: boolean } {
  const end = n.startSec + n.durationSec;
  const playing = n.startSec <= f.positionSec && end > f.positionSec;
  const accompaniment = f.practiced !== null && f.practiced !== 'both' && f.practiced !== n.hand;
  const hidden = f.hideBeforeSec !== null && n.startSec < f.hideBeforeSec - 1e-6;
  const outsideLoop =
    f.loop !== null && (n.startSec >= f.loop.endSec - 1e-6 || n.startSec < f.loop.startSec - 1e-6);
  const alpha = outsideLoop ? 0.18 : accompaniment ? 0.3 : playing ? 1 : 0.88;
  return { hidden, alpha, accompaniment, playing };
}

/** Wie weit (Songsekunden) vor dem Anschlag Strahlen sichtbar werden */
const BEAM_LEAD_SEC = 2.5;

function drawBeams(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: FallingFrame,
  yFor: (sec: number) => number,
): void {
  const lead = Math.min(f.windowSec, BEAM_LEAD_SEC);
  // Noten genau auf der Position einschließen: im Wait-Modus steht die Zeit auf ihrem Anfang
  const start = firstNoteIndexAtOrAfter(f.notes, f.positionSec - 1e-6);
  for (let i = start; i < f.notes.length; i++) {
    const n = f.notes[i]!;
    if (n.startSec > f.positionSec + lead) break;
    if (n.startSec < f.positionSec - 1e-6) continue;
    if (f.practiced !== null && f.practiced !== 'both' && f.practiced !== n.hand) continue;
    if (f.hideBeforeSec !== null && n.startSec < f.hideBeforeSec - 1e-6) continue;
    if (f.loop && (n.startSec >= f.loop.endSec - 1e-6 || n.startSec < f.loop.startSec - 1e-6)) continue;
    const k = layout.byMidi[n.midi];
    if (!k) continue;
    const prox = 1 - (n.startSec - f.positionSec) / lead; // 0 = weit weg, 1 = gleich
    const color = (f.color ?? byHand)(n.midi, n.hand);
    const yBottom = Math.max(0, yFor(n.startSec));
    const inset = k.black ? 1 : Math.max(2, k.w * 0.18);
    const grad = ctx.createLinearGradient(0, yBottom, 0, height);
    grad.addColorStop(0, rgba(color, 0.08));
    grad.addColorStop(1, rgba(color, 0.3 + 0.5 * prox));
    ctx.fillStyle = grad;
    ctx.fillRect(k.x + inset, yBottom, k.w - inset * 2, height - yBottom);
    // Landepunkt glüht auf
    const cx = k.x + k.w / 2;
    const r = k.w * (0.6 + 0.6 * prox);
    const glow = ctx.createRadialGradient(cx, height, 0, cx, height, r * 1.6);
    glow.addColorStop(0, rgba('#ffffff', 0.25 + 0.6 * prox));
    glow.addColorStop(0.35, rgba(color, 0.5 * prox));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r * 1.6, height - r * 1.6, r * 3.2, r * 1.6);
  }
}

/**
 * Zeichnet fallende Noten. Die Unterkante entspricht der aktuellen Position (Anschlagslinie).
 * Es werden nur sichtbare Noten durchlaufen (binäre Suche + max. Notenlänge).
 */
export function drawFallingNotes(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: FallingFrame,
): void {
  const { width } = layout;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);

  // Bahnen der schwarzen Tasten + Oktavlinien
  ctx.fillStyle = theme.laneBlack;
  for (const k of layout.blacks) ctx.fillRect(k.x, 0, k.w, height);
  ctx.fillStyle = theme.laneLine;
  for (const k of layout.whites)
    if (k.midi % 12 === 0 || k.midi % 12 === 5) ctx.fillRect(Math.round(k.x), 0, 1, height);

  const pxPerSec = height / f.windowSec;
  const yFor = (sec: number) => height - (sec - f.positionSec) * pxPerSec;
  const endVisible = f.positionSec + f.windowSec;

  // Taktstriche
  for (const m of f.measures) {
    if (m.startSec < f.positionSec - 0.01) continue;
    if (m.startSec > endVisible) break;
    ctx.fillStyle = theme.measureLine;
    ctx.fillRect(0, Math.round(yFor(m.startSec)), width, 1);
  }

  // Loop-Grenzen und Bereich außerhalb abdunkeln
  if (f.loop) {
    const yStart = yFor(f.loop.startSec);
    const yEnd = yFor(f.loop.endSec);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    if (yEnd > 0) ctx.fillRect(0, 0, width, Math.min(height, yEnd));
    if (yStart < height) ctx.fillRect(0, Math.max(0, yStart), width, height - Math.max(0, yStart));
    ctx.fillStyle = theme.loop;
    if (yEnd >= 0 && yEnd <= height) ctx.fillRect(0, Math.round(yEnd) - 1, width, 2);
    if (yStart >= 0 && yStart <= height) ctx.fillRect(0, Math.round(yStart) - 1, width, 2);
  }

  if (f.beginner) drawBeams(ctx, layout, height, f, yFor);

  if (f.waiting) {
    ctx.fillStyle = theme.waitGlow;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(performance.now() / 200);
    ctx.fillRect(0, height - 3, width, 3);
    ctx.globalAlpha = 1;
  }

  // Noten
  const colorOf = f.color ?? byHand;
  const start = firstNoteIndexAtOrAfter(f.notes, f.positionSec - f.maxDurationSec);
  for (let i = start; i < f.notes.length; i++) {
    const n = f.notes[i]!;
    if (n.startSec > endVisible) break;
    const end = n.startSec + n.durationSec;
    if (end < f.positionSec) continue;
    const k = layout.byMidi[n.midi];
    if (!k) continue;

    const yBottom = yFor(n.startSec);
    const yTop = yFor(end);
    const h = Math.max(4, yBottom - yTop - 1);
    const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
    const x = k.x + inset;
    const w = k.w - inset * 2;
    const vis = noteVisibility(n, f);
    const current = f.currentIds?.has(n.id) ?? false;
    if (vis.hidden) continue;
    ctx.fillStyle = colorOf(n.midi, n.hand);
    ctx.globalAlpha = vis.alpha;
    ctx.beginPath();
    ctx.roundRect(x, yTop, w, h, Math.min(4, w / 3));
    ctx.fill();
    if (current) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.waitGlow;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (k.black) {
      // Schwarze Tasten zusätzlich mit dunklem Rand – Unterscheidung ohne Farbe
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawFallingLabels(ctx, layout, height, f);
}

/**
 * Beschriftung der fallenden Noten: Taktnummern und Notennamen. Eigene Funktion, damit sie über dem
 * WebGL-Bild scharf (ohne Bloom) auf einer 2D-Ebene liegen kann.
 */
export function drawFallingLabels(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: FallingFrame,
  textColor: string = theme.noteText,
): void {
  const pxPerSec = height / f.windowSec;
  const yFor = (sec: number) => height - (sec - f.positionSec) * pxPerSec;
  const endVisible = f.positionSec + f.windowSec;

  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = theme.measureLabel;
  for (const m of f.measures) {
    if (m.startSec < f.positionSec - 0.01) continue;
    if (m.startSec > endVisible) break;
    ctx.fillText(String(m.index + 1), 4, Math.round(yFor(m.startSec)) - 2);
  }

  if (!f.showNoteNames) return;
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.max(8, Math.min(11, layout.whiteWidth * 0.5))}px system-ui, sans-serif`;
  ctx.fillStyle = textColor;
  const start = firstNoteIndexAtOrAfter(f.notes, f.positionSec - f.maxDurationSec);
  for (let i = start; i < f.notes.length; i++) {
    const n = f.notes[i]!;
    if (n.startSec > endVisible) break;
    const end = n.startSec + n.durationSec;
    if (end < f.positionSec) continue;
    const k = layout.byMidi[n.midi];
    if (!k) continue;
    const vis = noteVisibility(n, f);
    if (vis.hidden || vis.accompaniment) continue;
    const yBottom = yFor(n.startSec);
    const h = Math.max(4, yBottom - yFor(end) - 1);
    const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
    const w = k.w - inset * 2;
    if (h > 14 && w > 9) ctx.fillText(midiToName(n.midi).replace(/\d+$/, ''), k.x + k.w / 2, yBottom - 3);
  }
}

export interface RisingFrame {
  nowMs: number;
  /** Sichtbare Vergangenheit in Sekunden */
  windowSec: number;
  notes: readonly TrailNote[];
  marks: readonly TrailMark[];
  /** Tiefer als der Split-Punkt = linke Handfarbe */
  splitPoint: number;
  showNoteNames: boolean;
  /** Notennamen passend zur Tonart (z. B. Bb statt A# in b-Moll) */
  spell: (pc: number) => string;
  color?: NoteColorFn;
}

/**
 * Freies Spiel: gespielte Noten steigen von der Klaviatur nach oben (Unterkante = jetzt).
 * Erkannte Akkorde stehen als Marken am linken Rand auf Höhe ihres Anschlags.
 */
export function drawRisingNotes(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: RisingFrame,
): void {
  const { width } = layout;
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.laneBlack;
  for (const k of layout.blacks) ctx.fillRect(k.x, 0, k.w, height);
  ctx.fillStyle = theme.laneLine;
  for (const k of layout.whites)
    if (k.midi % 12 === 0 || k.midi % 12 === 5) ctx.fillRect(Math.round(k.x), 0, 1, height);

  const pxPerMs = height / (f.windowSec * 1000);
  const yFor = (ms: number) => height - (f.nowMs - ms) * pxPerMs;

  // Akkord-Marken: Linie über die ganze Breite (Name in drawRisingLabels)
  ctx.fillStyle = theme.measureLine;
  for (const m of f.marks) {
    const y = Math.round(yFor(m.timeMs));
    if (y >= 0 && y <= height) ctx.fillRect(0, y, width, 1);
  }

  const colorOf = f.color ?? byHand;
  for (const n of f.notes) {
    const k = layout.byMidi[n.midi];
    if (!k) continue;
    const yTop = yFor(n.startMs);
    const yBottom = n.endMs === null ? height : yFor(n.endMs);
    if (yTop > height || yBottom < 0) continue;
    const h = Math.max(3, yBottom - yTop);
    const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
    const x = k.x + inset;
    const w = k.w - inset * 2;
    ctx.fillStyle = colorOf(n.midi, n.midi < f.splitPoint ? 'left' : 'right');
    // Anschlagstärke über Deckkraft; gehaltene Noten voll
    ctx.globalAlpha = n.endMs === null ? 1 : 0.45 + 0.45 * n.velocity;
    ctx.beginPath();
    ctx.roundRect(x, yTop, w, h, Math.min(4, w / 3));
    ctx.fill();
    if (k.black) {
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawRisingLabels(ctx, layout, height, f);
}

/** Beschriftung des freien Spiels: Akkord-Marken und Notennamen */
export function drawRisingLabels(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: RisingFrame,
  textColor: string = theme.noteText,
): void {
  const pxPerMs = height / (f.windowSec * 1000);
  const yFor = (ms: number) => height - (f.nowMs - ms) * pxPerMs;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = theme.markLabel;
  for (const m of f.marks) {
    const y = Math.round(yFor(m.timeMs));
    if (y >= 0 && y <= height) ctx.fillText(m.label, 6, y - 3);
  }
  if (!f.showNoteNames) return;
  ctx.font = `600 ${Math.max(8, Math.min(11, layout.whiteWidth * 0.5))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = textColor;
  for (const n of f.notes) {
    const k = layout.byMidi[n.midi];
    if (!k) continue;
    const yTop = yFor(n.startMs);
    const yBottom = n.endMs === null ? height : yFor(n.endMs);
    if (yTop > height || yBottom < 0) continue;
    const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
    if (yBottom - yTop > 14 && k.w - inset * 2 > 9)
      ctx.fillText(f.spell(n.midi % 12), k.x + k.w / 2, yTop + 3);
  }
}
