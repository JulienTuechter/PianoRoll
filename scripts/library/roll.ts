/**
 * Piano-Roll eines Stücks als SVG (Bild auf der Seite) und als PNG (og:image, 1200×630).
 * Das PNG wird ohne Zusatzabhängigkeit erzeugt: Rechtecke in ein Palettenbild malen, mit node:zlib packen.
 */
import { deflateSync } from 'node:zlib';
import type { RollNote } from './types';

export const ROLL_W = 1200;
export const ROLL_H = 630;
const PAD = 28;

const COLORS = {
  bg: [0x14, 0x0d, 0x0a],
  lane: [0x24, 0x1a, 0x15],
  right: [0x56, 0xb4, 0xe9],
  left: [0xd5, 0x5e, 0x00],
} as const;
const hex = (c: readonly number[]) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

interface Geometry {
  lo: number;
  hi: number;
  rowH: number;
  pxPerSec: number;
  rects: { x: number; y: number; w: number; h: number; left: boolean }[];
  lanes: number[];
}

function geometry(notes: readonly RollNote[]): Geometry {
  let lo = 127;
  let hi = 0;
  let end = 0;
  for (const n of notes) {
    lo = Math.min(lo, n.midi);
    hi = Math.max(hi, n.midi);
    end = Math.max(end, n.start + n.dur);
  }
  // mindestens zwei Oktaven zeigen, damit kurze Melodien nicht zu Balken werden
  const span = Math.max(24, hi - lo + 3);
  const mid = (lo + hi) / 2;
  lo = Math.floor(mid - span / 2);
  hi = lo + span;
  const plotW = ROLL_W - 2 * PAD;
  const plotH = ROLL_H - 2 * PAD;
  const rowH = plotH / (hi - lo);
  const pxPerSec = plotW / Math.max(end, 1);
  const rects = notes.map((n) => ({
    x: PAD + n.start * pxPerSec,
    y: PAD + (hi - n.midi - 1) * rowH,
    w: Math.max(1.5, n.dur * pxPerSec - 1),
    h: Math.max(1.5, rowH - (rowH > 5 ? 1 : 0)),
    left: n.left,
  }));
  const lanes: number[] = [];
  for (let m = Math.ceil(lo / 12) * 12; m < hi; m += 12) lanes.push(PAD + (hi - m - 1) * rowH + rowH);
  return { lo, hi, rowH, pxPerSec, rects, lanes };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function rollSvg(notes: readonly RollNote[], title: string): string {
  const g = geometry(notes);
  const rects = (left: boolean) =>
    g.rects
      .filter((r) => r.left === left)
      .map((r) => `<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.w)}" height="${r1(r.h)}"/>`)
      .join('');
  const lanes = g.lanes
    .map((y) => `<line x1="${PAD}" x2="${ROLL_W - PAD}" y1="${r1(y)}" y2="${r1(y)}"/>`)
    .join('');
  const t = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ROLL_W} ${ROLL_H}" width="${ROLL_W}" height="${ROLL_H}" role="img">` +
    `<title>${t}</title>` +
    `<rect width="${ROLL_W}" height="${ROLL_H}" rx="14" fill="${hex(COLORS.bg)}"/>` +
    `<g stroke="${hex(COLORS.lane)}" stroke-width="1">${lanes}</g>` +
    `<g fill="${hex(COLORS.left)}">${rects(true)}</g>` +
    `<g fill="${hex(COLORS.right)}">${rects(false)}</g>` +
    `</svg>\n`
  );
}

/* ── PNG ─────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function rollPng(notes: readonly RollNote[]): Buffer {
  const g = geometry(notes);
  const W = ROLL_W;
  const H = ROLL_H;
  const stride = W + 1; // Filterbyte je Zeile (0 = keiner)
  const px = new Uint8Array(stride * H); // Palettenindex 0 = Hintergrund
  const fill = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    const xa = Math.max(0, Math.floor(x0));
    const xb = Math.min(W, Math.max(xa + 1, Math.round(x1)));
    const ya = Math.max(0, Math.floor(y0));
    const yb = Math.min(H, Math.max(ya + 1, Math.round(y1)));
    for (let y = ya; y < yb; y++) px.fill(c, y * stride + 1 + xa, y * stride + 1 + xb);
  };
  for (const y of g.lanes) fill(PAD, y, W - PAD, y + 1, 1);
  for (const left of [true, false])
    for (const r of g.rects) if (r.left === left) fill(r.x, r.y, r.x + r.w, r.y + r.h, left ? 3 : 2);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 3; // Palette
  const plte = Uint8Array.from([COLORS.bg, COLORS.lane, COLORS.right, COLORS.left].flat());
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', deflateSync(px, { level: 6 })),
    chunk('IEND', new Uint8Array()),
  ]);
}
