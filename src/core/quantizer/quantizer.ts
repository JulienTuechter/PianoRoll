import type { Hand, NoteEvent } from '../note-event-model/types';
import type { Recording } from '../recorder/recorder';

export interface QuantizeOptions {
  /** Raster als Teilung der Ganzen: 4 = Viertel, 8 = Achtel, 16 = Sechzehntel */
  grid: 4 | 8 | 16;
  /** Triolen erlauben (Achteltriolen, bei Raster 16 auch Sechzehnteltriolen) */
  triplets: boolean;
  /**
   * Swing-Toleranz: Position der zweiten Achtel im Schlag, wie sie gespielt wird.
   * 0.5 = gerade, 0.66 = Triolen-Swing. Gespielte Swing-Achtel werden auf gerade Achtel gelegt.
   */
  swing: number;
  /** Mindestnotenlänge als Teilung der Ganzen (z. B. 16 = Sechzehntel) */
  minNote: number;
  /** Leichte Überlappungen (Legato) am nächsten Anschlag abschneiden */
  resolveOverlaps: boolean;
  /** Töne unterhalb → linke Hand */
  splitPoint: number;
  ppq?: number;
}

export const defaultQuantizeOptions: QuantizeOptions = {
  grid: 16,
  triplets: false,
  swing: 0.5,
  minNote: 16,
  resolveOverlaps: true,
  splitPoint: 60,
  ppq: 480,
};

export interface QuantizedRecording {
  ppq: number;
  bpm: number;
  numerator: number;
  denominator: number;
  notes: NoteEvent[];
  measureTicks: number;
  measureCount: number;
}

/** Swing-Achtel (lang–kurz) auf gerade Achtel abbilden: Phase innerhalb des Schlags verzerren. */
export function unswing(phase: number, swing: number): number {
  if (swing <= 0.5 || phase <= 0 || phase >= 1) return phase;
  return phase < swing ? (phase * 0.5) / swing : 0.5 + ((phase - swing) * 0.5) / (1 - swing);
}

interface Onset {
  index: number;
  tick: number;
}

/**
 * Wählt pro Schlag gerades Raster oder Triolenraster – für alle Anschläge des Schlags gemeinsam,
 * damit keine gemischten, unlesbaren Rhythmen entstehen. Triolen müssen deutlich besser passen.
 */
/** Auf Raster runden; `|| 0` verhindert -0 bei kleinen negativen Werten. */
function snap(t: number, step: number): number {
  return Math.round(t / step) * step || 0;
}

function snapOnsets(
  onsets: Onset[],
  beat: number,
  straight: number,
  triplet: number | null,
): Map<number, number> {
  const out = new Map<number, number>();
  const byBeat = new Map<number, Onset[]>();
  for (const o of onsets) {
    // Zuordnung zum Schlag über die gerade gerundete Position (Anschläge kurz vor dem Schlag gehören zu ihm)
    const b = Math.floor(snap(o.tick, straight) / beat);
    const list = byBeat.get(b);
    if (list) list.push(o);
    else byBeat.set(b, [o]);
  }
  for (const list of byBeat.values()) {
    const snapS = list.map((o) => snap(o.tick, straight));
    const errS = list.reduce((s, o, i) => s + Math.abs(o.tick - snapS[i]!), 0);
    let useTriplet = false;
    let snapT: number[] = [];
    if (triplet) {
      snapT = list.map((o) => snap(o.tick, triplet));
      const errT = list.reduce((s, o, i) => s + Math.abs(o.tick - snapT[i]!), 0);
      // Triolen nur, wenn sie klar besser passen und wirklich Triolenpositionen vorkommen
      const hasTripletPos = snapT.some((t) => t % straight !== 0);
      useTriplet = hasTripletPos && errT < errS * 0.6;
    }
    list.forEach((o, i) => out.set(o.index, useTriplet ? snapT[i]! : snapS[i]!));
  }
  return out;
}

/**
 * Quantisiert eine Live-Aufnahme in Ticks: Swing-Ausgleich, Raster (inkl. Triolen pro Schlag),
 * Mindestlänge, Überlappungen, Hände-Trennung. Noten, die mehr als ein halbes Raster vor dem Start
 * liegen (z. B. während des Count-ins), werden verworfen.
 */
export function quantize(rec: Recording, options: Partial<QuantizeOptions> = {}): QuantizedRecording {
  const o = { ...defaultQuantizeOptions, ...options };
  const ppq = o.ppq ?? 480;
  const ticksPerMs = (ppq * rec.bpm) / 60000;
  const beat = ppq; // Swing/Triolen beziehen sich auf Viertel
  const straight = (ppq * 4) / o.grid;
  const triplet = o.triplets ? (o.grid >= 16 ? ppq / 6 : ppq / 3) : null;
  const minTicks = Math.max(1, Math.round((ppq * 4) / o.minNote));

  const toTick = (ms: number) => {
    const t = ms * ticksPerMs;
    if (o.swing <= 0.5 || o.grid < 8) return t;
    const b = Math.floor(t / beat);
    return (b + unswing(t / beat - b, o.swing)) * beat;
  };

  const raw = rec.notes.map((n, index) => ({ n, index, start: toTick(n.startMs), end: toTick(n.endMs) }));
  const starts = snapOnsets(
    raw.map((r) => ({ index: r.index, tick: r.start })),
    beat,
    straight,
    triplet,
  );

  type Q = { midi: number; start: number; end: number; velocity: number; hand: Hand };
  const qs: Q[] = [];
  for (const r of raw) {
    let start = starts.get(r.index) ?? 0;
    if (start < 0) {
      if (r.start < -straight / 2) continue; // deutlich vor dem Start → verwerfen
      start = 0;
    }
    // Ende auf dasselbe Raster wie der Anfang (gerade oder Triole)
    const step = triplet && start % straight !== 0 ? triplet : straight;
    let end = snap(r.end, step);
    // Leicht abgesetzte Noten (z. B. Viertel nur 85 % gehalten) bis zur nächsten natürlichen Grenze verlängern:
    // Schlag bei längeren Noten, sonst Rasterschritt. Zu lange Überhänge kürzt die Überlappungsregel unten.
    const unit = step === triplet ? step : r.end - r.start >= beat / 2 ? beat : straight;
    const boundary = Math.ceil(r.end / unit) * unit;
    if (boundary > end && boundary - r.end <= 0.3 * unit) end = boundary;
    // Triolennoten mindestens eine Triole lang (Mindestlänge liegt evtl. nicht auf dem Triolenraster)
    const minLen = step === triplet ? triplet : minTicks;
    if (end - start < minLen) end = start + minLen;
    qs.push({
      midi: r.n.midi,
      start,
      end,
      velocity: r.n.velocity,
      hand: r.n.midi < o.splitPoint ? 'left' : 'right',
    });
  }
  qs.sort((a, b) => a.start - b.start || a.midi - b.midi);

  // Doppelte Anschläge derselben Taste am selben Rasterpunkt zusammenfassen
  const dedup: Q[] = [];
  for (const q of qs) {
    const dup = dedup.find((d) => d.midi === q.midi && d.start === q.start);
    if (dup) dup.end = Math.max(dup.end, q.end);
    else dedup.push(q);
  }

  // Überlappungen: gleiche Taste immer kürzen; Legato-Überhang (≤ halber Schlag) am nächsten Anschlag der Hand kürzen
  for (const hand of ['left', 'right'] as const) {
    const list = dedup.filter((q) => q.hand === hand);
    const onsets = [...new Set(list.map((q) => q.start))].sort((a, b) => a - b);
    for (const q of list) {
      const nextSame = list.find((x) => x !== q && x.midi === q.midi && x.start > q.start);
      if (nextSame && q.end > nextSame.start) q.end = nextSame.start;
      if (!o.resolveOverlaps) continue;
      const nextOnset = onsets.find((t) => t > q.start);
      if (nextOnset !== undefined && q.end > nextOnset && q.end - nextOnset <= beat / 2) q.end = nextOnset;
    }
  }

  const measureTicks = Math.round(ppq * rec.numerator * (4 / rec.denominator));
  const lastEnd = dedup.reduce((m, q) => Math.max(m, q.end), 0);
  const measureCount = Math.max(1, Math.ceil(lastEnd / measureTicks));
  const secPerTick = 60 / (rec.bpm * ppq);

  const notes: NoteEvent[] = dedup.map((q, i) => ({
    id: `rec-${i}`,
    midi: q.midi,
    startTick: q.start,
    durationTicks: q.end - q.start,
    startSec: q.start * secPerTick,
    durationSec: (q.end - q.start) * secPerTick,
    velocity: q.velocity,
    hand: q.hand,
    track: q.hand === 'right' ? 0 : 1,
  }));
  return {
    ppq,
    bpm: rec.bpm,
    numerator: rec.numerator,
    denominator: rec.denominator,
    notes,
    measureTicks,
    measureCount,
  };
}
