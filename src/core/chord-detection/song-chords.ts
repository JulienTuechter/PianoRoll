import type { Beat } from '../practice-engine/beats';
import type { MeasureInfo } from '../note-event-model/tempo-map';
import type { NoteEvent } from '../note-event-model/types';
import { pc } from '../key-detection/key';
import { chordScore, detectChordFromPcs, withBass, type DetectedChord } from './chord';

export interface TimeWindow {
  startSec: number;
  endSec: number;
}

export interface ChordSegment extends TimeWindow {
  chord: DetectedChord | null;
  /** Gewichte der Tonhöhenklassen (klingende Dauer) im Abschnitt */
  weights: number[];
  measure: number;
}

/**
 * Analysefenster: gerade Taktarten ab 4/4 in Halbtakte, sonst ganze Takte.
 * Kürzere Fenster würden Durchgangstöne der Melodie als Akkordwechsel deuten.
 */
export function harmonicWindows(
  measures: readonly MeasureInfo[],
  beats: readonly Beat[],
  endSec: number,
): (TimeWindow & { measure: number })[] {
  const out: (TimeWindow & { measure: number })[] = [];
  measures.forEach((m, i) => {
    const mEnd = measures[i + 1]?.startSec ?? endSec;
    if (m.numerator >= 4 && m.numerator % 2 === 0) {
      const mid = beats.find((b) => b.measure === m.index && b.beat === m.numerator / 2)?.startSec;
      if (mid !== undefined && mid > m.startSec && mid < mEnd) {
        out.push({ startSec: m.startSec, endSec: mid, measure: m.index });
        out.push({ startSec: mid, endSec: mEnd, measure: m.index });
        return;
      }
    }
    out.push({ startSec: m.startSec, endSec: mEnd, measure: m.index });
  });
  return out.filter((w) => w.endSec > w.startSec);
}

/** Klingende Dauer je Tonhöhenklasse im Fenster sowie tiefste Note. */
export function windowWeights(
  notes: readonly NoteEvent[],
  w: TimeWindow,
): { weights: number[]; lowest: number | null } {
  const weights = new Array<number>(12).fill(0);
  let lowest: number | null = null;
  for (const n of notes) {
    const overlap = Math.min(w.endSec, n.startSec + n.durationSec) - Math.max(w.startSec, n.startSec);
    if (overlap <= 0) continue;
    weights[pc(n.midi)] = (weights[pc(n.midi)] ?? 0) + overlap;
    if (lowest === null || n.midi < lowest) lowest = n.midi;
  }
  return { weights, lowest };
}

/**
 * Akkord aus Gewichten. Alle Teilmengen (≥ 3 Töne) der deutlich hörbaren Töne werden gedeutet und nach
 * Gebräuchlichkeit + abgedecktem Anteil bewertet – so wird ein Dreiklang mit Melodienote nicht zum Sextakkord.
 */
export function chordFromWeights(
  weights: readonly number[],
  bassPc: number | null,
  spell: (pc: number) => string,
): DetectedChord | null {
  const max = Math.max(...weights);
  if (max <= 0) return null;
  // Auswahl auf gestauchten Gewichten: ein langer Basston soll kurze Akkordtöne nicht unter die Schwelle drücken
  const soft = weights.map((w) => Math.sqrt(Math.max(0, w)));
  const softMax = Math.sqrt(max);
  const strong = soft
    .map((w, p) => ({ w, p }))
    .filter((x) => x.w > 0 && x.w >= softMax * 0.15)
    .sort((a, b) => b.w - a.w)
    .slice(0, 5)
    .map((x) => x.p);
  if (strong.length < 3) return null;

  let best: { chord: DetectedChord; score: number } | null = null;
  const n = strong.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = strong.filter((_, i) => mask & (1 << i));
    if (subset.length < 3) continue;
    const hasBass = bassPc !== null && subset.includes(bassPc);
    const chord = detectChordFromPcs(subset, hasBass ? bassPc : subset[0]!, spell);
    if (!chord) continue;
    const score = chordScore(chord) + 40 * coverage(chord, weights) - (hasBass ? 0 : 10);
    if (!best || score > best.score) best = { chord, score };
  }
  return best?.chord ?? null;
}

/** Anteil der Gewichte, den die Akkordtöne abdecken (0..1). */
export function coverage(chord: DetectedChord, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  return chord.pcs.reduce((a, p) => a + (weights[p] ?? 0), 0) / total;
}

/**
 * Akkordfolge eines Stücks. Fenster ohne eindeutigen Akkord (z. B. Bass + Melodie) übernehmen den vorherigen
 * oder nächsten Akkord – je nachdem, welcher die gespielten Töne besser abdeckt. Gleiche Nachbarn werden zusammengefasst.
 */
export function analyzeSongChords(
  notes: readonly NoteEvent[],
  windows: readonly (TimeWindow & { measure: number })[],
  spell: (pc: number) => string,
): ChordSegment[] {
  const raw = windows.map((w) => {
    const { weights, lowest } = windowWeights(notes, w);
    return {
      w,
      weights,
      lowest,
      chord: chordFromWeights(weights, lowest === null ? null : pc(lowest), spell),
    };
  });

  const filled: (DetectedChord | null)[] = [];
  raw.forEach((r, i) => {
    if (r.chord) {
      filled.push(r.chord);
      return;
    }
    const prev = filled[i - 1] ?? null;
    const next = raw.slice(i + 1).find((x) => x.chord)?.chord ?? null;
    // Abdeckung der Töne; Gleichstand entscheidet der Bass (Grundton im Bass = neuer Akkord)
    const lowPc = r.lowest === null ? null : pc(r.lowest);
    const score = (c: DetectedChord | null) =>
      c ? coverage(c, r.weights) + (c.rootPc === lowPc ? 0.25 : 0) : -1;
    const sp = score(prev);
    const sn = score(next);
    filled.push(sn > sp && next && coverage(next, r.weights) >= 0.5 ? next : prev);
  });

  // Gleicher Grundton + gleiche Qualität → ein Abschnitt; Bass = tiefste Note des ganzen Abschnitts
  const out: (ChordSegment & { lowest: number | null })[] = [];
  raw.forEach((r, i) => {
    const chord = filled[i] ?? null;
    const last = out[out.length - 1];
    const same =
      last &&
      ((last.chord === null && chord === null) ||
        (last.chord !== null &&
          chord !== null &&
          last.chord.rootPc === chord.rootPc &&
          last.chord.quality === chord.quality));
    if (last && same) {
      last.endSec = r.w.endSec;
      last.weights = last.weights.map((x, k) => x + (r.weights[k] ?? 0));
      if (r.lowest !== null && (last.lowest === null || r.lowest < last.lowest)) last.lowest = r.lowest;
    } else {
      out.push({
        startSec: r.w.startSec,
        endSec: r.w.endSec,
        chord,
        weights: [...r.weights],
        measure: r.w.measure,
        lowest: r.lowest,
      });
    }
  });
  return out.map(({ lowest, ...seg }) => {
    const c = seg.chord;
    if (c && lowest !== null && c.pcs.includes(pc(lowest)))
      return { ...seg, chord: withBass(c, lowest, spell) };
    return seg;
  });
}

/** Index des Abschnitts an `sec` (binäre Suche), −1 vor dem ersten. */
export function segmentIndexAt(segments: readonly ChordSegment[], sec: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if ((segments[mid]?.startSec ?? Infinity) <= sec + 1e-9) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Tonart-Histogramm eines ganzen Stücks (für Stücke ohne Vorzeichenangabe). */
export function songHistogram(notes: readonly NoteEvent[]): number[] {
  const h = new Array<number>(12).fill(0);
  for (const n of notes) h[pc(n.midi)] = (h[pc(n.midi)] ?? 0) + n.durationSec;
  return h;
}
