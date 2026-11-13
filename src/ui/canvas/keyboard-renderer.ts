import type { KeyJudgement } from '../../core/practice-engine/engine-types';
import type { Hand } from '../../core/note-event-model/types';
import { handColors, theme } from '../theme';
import { BLACK_HEIGHT_RATIO, type KeyboardLayout, type KeyRect } from './keyboard-layout';

export interface KeyFlash {
  kind: KeyJudgement;
  untilMs: number;
}

export interface KeyboardFrame {
  pressed: ReadonlyMap<number, unknown>;
  sustained: ReadonlySet<number>;
  /** Tasten, die laut Stück gerade klingen (Vorspielen, Begleitung, Performance) */
  active: ReadonlyMap<number, Hand>;
  labels: ReadonlyMap<number, string> | null;
  /** Wait-Modus: erwartete Tasten der aktuellen Gruppe */
  expected: ReadonlyMap<number, Hand> | null;
  /** Wait-Modus: bereits erfüllte erwartete Tasten */
  satisfied: { has(midi: number): boolean };
  /** Bewertung gehaltener Tasten */
  judgements: ReadonlyMap<number, KeyJudgement>;
  /** Kurz nachleuchtende Bewertungen nach dem Loslassen */
  flashes: ReadonlyMap<number, KeyFlash>;
  hint: boolean;
  nowMs: number;
  /** Harmony Assist: vorgeschlagener Akkord (Bass = linke Hand, upper = rechte Hand) */
  ghost: { bass: number; upper: readonly number[] } | null;
  /** true = automatischer Vorschlag: nur Ringe, ohne Tönung */
  ghostSoft: boolean;
  /** Harmony Assist: Tonhöhenklassen der Tonleiter */
  scalePcs: ReadonlySet<number> | null;
}

function roundRectBottom(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.closePath();
}

type Mark = 'check' | 'cross' | 'up' | 'down' | null;

interface KeyLook {
  fill: string;
  mark: Mark;
  /** Erwartete Taste: Markierung in Handfarbe */
  expectHand: Hand | null;
}

const JUDGED: Record<KeyJudgement, { fill: string; mark: Mark }> = {
  correct: { fill: theme.correct, mark: 'check' },
  wrong: { fill: theme.wrong, mark: 'cross' },
  // zu früh: Note war noch „oben“ → Pfeil nach oben; zu spät → nach unten
  early: { fill: theme.timing, mark: 'up' },
  late: { fill: theme.timing, mark: 'down' },
};

function handKey(hand: Hand): string {
  return hand === 'right' ? handColors.rightKey : handColors.leftKey;
}

function lookFor(midi: number, black: boolean, f: KeyboardFrame): KeyLook {
  const base = black ? theme.blackKey : theme.whiteKey;
  const expectHand = f.expected?.get(midi) ?? null;
  const pending = expectHand !== null && !f.satisfied.has(midi) ? expectHand : null;

  if (f.pressed.has(midi)) {
    const j = f.judgements.get(midi);
    if (j) return { ...JUDGED[j], expectHand: j === 'correct' ? null : pending };
    return { fill: theme.pressed, mark: null, expectHand: pending };
  }
  const flash = f.flashes.get(midi);
  if (flash && flash.untilMs > f.nowMs) return { ...JUDGED[flash.kind], expectHand: pending };

  if (pending) {
    // Hinweis: volle Handfarbe; sonst nur Markierung
    if (f.hint) return { fill: handKey(pending), mark: null, expectHand: pending };
    return { fill: base, mark: null, expectHand: pending };
  }
  if (expectHand && f.satisfied.has(midi)) return { fill: theme.correct, mark: null, expectHand: null };

  const hand = f.active.get(midi);
  if (hand) return { fill: handKey(hand), mark: null, expectHand: null };
  if (f.sustained.has(midi)) return { fill: theme.sustained, mark: null, expectHand: null };
  return { fill: base, mark: null, expectHand: null };
}

function drawMark(ctx: CanvasRenderingContext2D, k: KeyRect, y: number, mark: Mark): void {
  if (!mark) return;
  const size = Math.min(k.w * 0.32, 7);
  const cx = k.x + k.w / 2;
  ctx.strokeStyle = '#0e1014';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (mark) {
    case 'cross':
      ctx.moveTo(cx - size, y - size);
      ctx.lineTo(cx + size, y + size);
      ctx.moveTo(cx + size, y - size);
      ctx.lineTo(cx - size, y + size);
      break;
    case 'check':
      ctx.moveTo(cx - size, y);
      ctx.lineTo(cx - size * 0.3, y + size * 0.7);
      ctx.lineTo(cx + size, y - size * 0.7);
      break;
    case 'up':
    case 'down': {
      const d = mark === 'up' ? -1 : 1;
      ctx.moveTo(cx, y - d * size);
      ctx.lineTo(cx, y + d * size);
      ctx.moveTo(cx - size * 0.7, y + d * size * 0.2);
      ctx.lineTo(cx, y + d * size);
      ctx.lineTo(cx + size * 0.7, y + d * size * 0.2);
      break;
    }
  }
  ctx.stroke();
}

function drawExpectMarker(
  ctx: CanvasRenderingContext2D,
  k: KeyRect,
  y: number,
  hand: Hand,
  hint: boolean,
  nowMs: number,
): void {
  const r = Math.min(k.w * 0.32, 7);
  const pulse = hint ? 0.5 + 0.5 * Math.sin(nowMs / 120) : 1;
  ctx.globalAlpha = 0.55 + 0.45 * pulse;
  ctx.fillStyle = hand === 'right' ? handColors.right : handColors.left;
  ctx.beginPath();
  ctx.arc(k.x + k.w / 2, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = k.black ? '#ffffff' : '#0e1014';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  k: KeyRect,
  y: number,
  hand: Hand,
  height: number,
  soft: boolean,
): void {
  const color = hand === 'right' ? handColors.right : handColors.left;
  if (!soft) {
    // leichte Tönung der ganzen Taste
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.fillRect(k.x + 1, 2, k.w - 2, height - 3);
  }
  ctx.globalAlpha = soft ? 0.75 : 1;
  // Ring statt gefülltem Punkt (gefüllt = erwartete Taste)
  const r = Math.min(k.w * 0.34, 8);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(k.x + k.w / 2, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawScaleDot(ctx: CanvasRenderingContext2D, k: KeyRect, y: number): void {
  ctx.fillStyle = k.black ? 'rgba(255,255,255,0.45)' : 'rgba(14,16,20,0.28)';
  ctx.beginPath();
  ctx.arc(k.x + k.w / 2, y, Math.min(k.w * 0.12, 3), 0, Math.PI * 2);
  ctx.fill();
}

export function drawKeyboard(
  ctx: CanvasRenderingContext2D,
  layout: KeyboardLayout,
  height: number,
  f: KeyboardFrame,
): void {
  ctx.clearRect(0, 0, layout.width, height);
  const r = Math.min(4, layout.whiteWidth * 0.2);
  const bh = height * BLACK_HEIGHT_RATIO;
  // Markierung mittig zwischen Unterkante der schwarzen Tasten und Tastenbeschriftung
  const whiteMarkY = (bh + (height - 36)) / 2;
  const blackMarkY = bh - Math.max(14, bh * 0.2);

  const whiteLooks: KeyLook[] = [];
  for (const k of layout.whites) {
    const look = lookFor(k.midi, false, f);
    whiteLooks.push(look);
    ctx.fillStyle = look.fill;
    roundRectBottom(ctx, k.x + 0.5, 0, k.w - 1, height - 1, r);
    ctx.fill();
    ctx.fillStyle = theme.whiteKeyShade;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(k.x + 0.5, height - 6, k.w - 1, 5);
    ctx.globalAlpha = 1;
  }

  ctx.font = `${Math.max(8, Math.min(11, layout.whiteWidth * 0.45))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  for (const k of layout.whites) {
    if (k.midi % 12 === 0) {
      ctx.fillStyle = theme.keyLabel;
      ctx.fillText(`C${Math.floor(k.midi / 12) - 1}`, k.x + k.w / 2, height - 9);
    }
  }

  const ghostHand = new Map<number, Hand>();
  if (f.ghost) {
    ghostHand.set(f.ghost.bass, 'left');
    for (const m of f.ghost.upper) ghostHand.set(m, 'right');
  }
  // direkt unter den schwarzen Tasten – kollidiert weder mit Markierungen noch mit Beschriftungen
  const scaleY = bh + 7;

  layout.whites.forEach((k, i) => {
    const look = whiteLooks[i]!;
    if (f.scalePcs?.has(k.midi % 12)) drawScaleDot(ctx, k, scaleY);
    const gh = ghostHand.get(k.midi);
    if (gh && !f.pressed.has(k.midi)) drawGhost(ctx, k, whiteMarkY, gh, height, f.ghostSoft);
    if (look.expectHand) drawExpectMarker(ctx, k, whiteMarkY, look.expectHand, f.hint, f.nowMs);
    drawMark(ctx, k, whiteMarkY, look.mark);
  });

  for (const k of layout.blacks) {
    const look = lookFor(k.midi, true, f);
    ctx.fillStyle = look.fill;
    roundRectBottom(ctx, k.x, 0, k.w, bh, r * 0.6);
    ctx.fill();
    if (look.fill === theme.blackKey) {
      ctx.fillStyle = theme.blackKeyTop;
      ctx.fillRect(k.x + k.w * 0.18, bh - 8, k.w * 0.64, 5);
    }
    if (f.scalePcs?.has(k.midi % 12)) drawScaleDot(ctx, k, bh - 6);
    const gh = ghostHand.get(k.midi);
    if (gh && !f.pressed.has(k.midi)) drawGhost(ctx, k, blackMarkY, gh, bh, f.ghostSoft);
    if (look.expectHand) drawExpectMarker(ctx, k, blackMarkY, look.expectHand, f.hint, f.nowMs);
    drawMark(ctx, k, blackMarkY, look.mark);
  }

  if (f.labels) {
    ctx.font = `bold ${Math.max(8, Math.min(12, layout.whiteWidth * 0.5))}px system-ui, sans-serif`;
    for (const [midi, label] of f.labels) {
      const k = layout.byMidi[midi];
      if (!k) continue;
      ctx.fillStyle = k.black ? '#c7cbd3' : '#4b5160';
      ctx.fillText(label, k.x + k.w / 2, k.black ? 14 : height - 24);
    }
  }

  ctx.fillStyle = theme.nowLine;
  ctx.fillRect(0, 0, layout.width, 2);
}
