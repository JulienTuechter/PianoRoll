/**
 * Notenfarben der Bühne: nach Hand (einstellbare Handfarben) oder nach Tonhöhe.
 * Tonhöhe: Farbverlauf in OKLCH von links kühl (Blau) nach rechts warm (Rot), bei gleicher Helligkeit,
 * damit keine Tonhöhe heller „wirkt“ als eine andere.
 */
import { PIANO_MAX_MIDI, PIANO_MIN_MIDI } from '../../core/note-event-model/types';

export function hexToNumber(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  return m?.[1] ? parseInt(m[1], 16) : 0xffffff;
}

export function numberToCss(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** OKLCH → sRGB (0xRRGGBB), außerhalb des Farbraums auf den Rand geklemmt */
export function oklchToNumber(l: number, c: number, hDeg: number): number {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const [r, g, bl] = lin.map((x) => {
    const v = Math.max(0, Math.min(1, x));
    return Math.round((v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255);
  }) as [number, number, number];
  return (r << 16) | (g << 8) | bl;
}

/** Farbtöne (OKLCH-Hue) entlang der Klaviatur: Blau → Cyan → Grün → Gelb → Orange → Rot */
const PITCH_HUES = [255, 205, 150, 95, 55, 25];

function pitchHue(t: number): number {
  const seg = PITCH_HUES.length - 1;
  const x = Math.max(0, Math.min(1, t)) * seg;
  const i = Math.min(seg - 1, Math.floor(x));
  const f = x - i;
  return PITCH_HUES[i]! + (PITCH_HUES[i + 1]! - PITCH_HUES[i]!) * f;
}

const pitchTable: number[] = [];
for (let m = 0; m < 128; m++) {
  const t = (m - PIANO_MIN_MIDI) / (PIANO_MAX_MIDI - PIANO_MIN_MIDI);
  pitchTable[m] = oklchToNumber(0.76, 0.15, pitchHue(t));
}

export function pitchColor(midi: number): number {
  return pitchTable[Math.max(0, Math.min(127, Math.round(midi)))]!;
}

/** Mischt zwei Farben (t = 0 → a, 1 → b) */
export function mix(a: number, b: number, t: number): number {
  const ch = (n: number, s: number) => (n >> s) & 255;
  const lerp = (x: number, y: number) => Math.round(x + (y - x) * t);
  return (lerp(ch(a, 16), ch(b, 16)) << 16) | (lerp(ch(a, 8), ch(b, 8)) << 8) | lerp(ch(a, 0), ch(b, 0));
}
