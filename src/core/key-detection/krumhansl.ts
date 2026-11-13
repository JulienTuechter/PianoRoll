import { type MusicalKey, pc, sameKey } from './key';

/** Krumhansl-Kessler-Profile (Dur/Moll), Index 0 = Tonika */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = (a[i] ?? 0) - ma;
    const y = (b[i] ?? 0) - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export interface KeyEstimate {
  key: MusicalKey;
  /** Korrelation −1..1 */
  correlation: number;
  /** 0..1: Abstand zur zweitbesten Tonart (wie eindeutig ist das Ergebnis?) */
  confidence: number;
  ranking: { key: MusicalKey; correlation: number }[];
}

/** Krumhansl-Schmuckler: Tonhöhenklassen-Histogramm (z. B. Dauern) mit allen 24 rotierten Profilen korrelieren. */
export function estimateKey(histogram: readonly number[]): KeyEstimate | null {
  if (histogram.length !== 12 || histogram.reduce((s, x) => s + x, 0) <= 0) return null;
  const ranking: { key: MusicalKey; correlation: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const [mode, profile] of [
      ['major', MAJOR_PROFILE],
      ['minor', MINOR_PROFILE],
    ] as const) {
      const rotated = histogram.map((_, i) => profile[pc(i - tonic)] ?? 0);
      ranking.push({ key: { tonicPc: tonic, mode }, correlation: correlation(histogram, rotated) });
    }
  }
  ranking.sort((a, b) => b.correlation - a.correlation);
  const best = ranking[0]!;
  const second = ranking[1]!;
  return {
    key: best.key,
    correlation: best.correlation,
    confidence: Math.max(0, Math.min(1, (best.correlation - second.correlation) / 0.15)),
    ranking,
  };
}

interface Sounded {
  pc: number;
  start: number;
  end: number | null;
  weight: number;
}

/**
 * Tonart über ein gleitendes Zeitfenster (Standard 8 s) des eigenen Spiels.
 * Mit Hysterese: Die angezeigte Tonart wechselt erst, wenn eine andere deutlich besser passt.
 */
export class KeyTracker {
  private notes: Sounded[] = [];
  private readonly active = new Map<number, Sounded>();
  private current: KeyEstimate | null = null;

  constructor(
    private readonly windowMs = 8000,
    /** Mindestvorsprung (Korrelation), bevor die Tonart wechselt */
    private readonly hysteresis = 0.04,
    /** Kurze Noten zählen mindestens so lang */
    private readonly minDurationMs = 120,
  ) {}

  noteOn(midi: number, timeMs: number, velocity = 1): void {
    const s: Sounded = { pc: pc(midi), start: timeMs, end: null, weight: 0.5 + 0.5 * velocity };
    if (this.active.has(midi)) this.noteOff(midi, timeMs);
    this.active.set(midi, s);
    this.notes.push(s);
  }

  noteOff(midi: number, timeMs: number): void {
    const s = this.active.get(midi);
    if (!s) return;
    s.end = Math.max(timeMs, s.start + this.minDurationMs);
    this.active.delete(midi);
  }

  reset(): void {
    this.notes = [];
    this.active.clear();
    this.current = null;
  }

  histogram(nowMs: number): number[] {
    const from = nowMs - this.windowMs;
    this.notes = this.notes.filter((n) => n.end === null || n.end > from);
    const h = new Array<number>(12).fill(0);
    for (const n of this.notes) {
      const end = n.end ?? Math.max(nowMs, n.start + this.minDurationMs);
      const overlap = Math.min(end, nowMs) - Math.max(n.start, from);
      if (overlap > 0) h[n.pc] = (h[n.pc] ?? 0) + overlap * n.weight;
    }
    return h;
  }

  estimate(nowMs: number): KeyEstimate | null {
    const next = estimateKey(this.histogram(nowMs));
    if (!next) return this.current;
    if (!this.current) {
      this.current = next;
      return next;
    }
    const cur = this.current.key;
    const curNow = next.ranking.find((r) => sameKey(r.key, cur));
    if (!sameKey(next.key, cur) && curNow && next.correlation - curNow.correlation < this.hysteresis) {
      // alte Tonart beibehalten, aber Werte aktualisieren
      this.current = { ...next, key: cur, correlation: curNow.correlation, confidence: 0 };
      return this.current;
    }
    this.current = next;
    return next;
  }
}
