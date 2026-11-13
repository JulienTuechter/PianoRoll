import { Note } from 'tonal';
import type { ChordQuality, DetectedChord } from '../chord-detection/chord';
import { keyTonicName, pc, type MusicalKey } from '../key-detection/key';

/** Harmonische Grundklasse für die Stufenzuordnung */
export type ChordClass = 'maj' | 'min' | 'dim' | 'aug' | 'dom7' | 'hdim7' | 'dim7';

export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';

export interface ScaleChord {
  numeral: string;
  /** Intervall des Grundtons zur Tonika (tonal-Notation, z. B. "5P") */
  interval: string;
  semitones: number;
  cls: ChordClass;
  fn: HarmonicFunction;
}

const MAJOR: ScaleChord[] = [
  { numeral: 'I', interval: '1P', semitones: 0, cls: 'maj', fn: 'tonic' },
  { numeral: 'ii', interval: '2M', semitones: 2, cls: 'min', fn: 'subdominant' },
  { numeral: 'iii', interval: '3M', semitones: 4, cls: 'min', fn: 'tonic' },
  { numeral: 'IV', interval: '4P', semitones: 5, cls: 'maj', fn: 'subdominant' },
  { numeral: 'iv', interval: '4P', semitones: 5, cls: 'min', fn: 'subdominant' },
  { numeral: 'V', interval: '5P', semitones: 7, cls: 'maj', fn: 'dominant' },
  { numeral: 'V7', interval: '5P', semitones: 7, cls: 'dom7', fn: 'dominant' },
  { numeral: 'vi', interval: '6M', semitones: 9, cls: 'min', fn: 'tonic' },
  { numeral: '♭VII', interval: '7m', semitones: 10, cls: 'maj', fn: 'subdominant' },
  { numeral: 'vii°', interval: '7M', semitones: 11, cls: 'dim', fn: 'dominant' },
];

const MINOR: ScaleChord[] = [
  { numeral: 'i', interval: '1P', semitones: 0, cls: 'min', fn: 'tonic' },
  { numeral: 'ii°', interval: '2M', semitones: 2, cls: 'dim', fn: 'subdominant' },
  { numeral: 'III', interval: '3m', semitones: 3, cls: 'maj', fn: 'tonic' },
  { numeral: 'iv', interval: '4P', semitones: 5, cls: 'min', fn: 'subdominant' },
  { numeral: 'v', interval: '5P', semitones: 7, cls: 'min', fn: 'dominant' },
  { numeral: 'V', interval: '5P', semitones: 7, cls: 'maj', fn: 'dominant' },
  { numeral: 'V7', interval: '5P', semitones: 7, cls: 'dom7', fn: 'dominant' },
  { numeral: 'VI', interval: '6m', semitones: 8, cls: 'maj', fn: 'subdominant' },
  { numeral: 'VII', interval: '7m', semitones: 10, cls: 'maj', fn: 'dominant' },
  { numeral: 'vii°7', interval: '7M', semitones: 11, cls: 'dim7', fn: 'dominant' },
];

type Table = Record<string, Record<string, number>>;

/** Mindestanzahl Vorschläge (Anforderung: 4–6) */
const MIN_SUGGESTIONS = 4;

/**
 * Übergangsgewichte nach Funktionsharmonik (Kadenzen, Quintfall, Trugschluss V→vi bzw. V→VI,
 * Plagalschluss IV→I, Moll-Subdominante iv in Dur …). Werte werden normiert.
 */
const MAJOR_TRANSITIONS: Table = {
  start: { I: 30, IV: 20, V: 18, vi: 14, ii: 10, V7: 8 },
  I: { IV: 25, V: 22, vi: 18, ii: 13, V7: 9, iii: 5, 'vii°': 4, '♭VII': 4 },
  ii: { V: 40, V7: 32, 'vii°': 9, IV: 6, I: 5, vi: 5, iii: 3 },
  iii: { vi: 42, IV: 28, ii: 14, I: 8, V: 8 },
  IV: { V: 28, I: 24, V7: 15, ii: 10, 'vii°': 7, iv: 7, vi: 6, iii: 3 },
  iv: { I: 55, V: 20, V7: 15, IV: 10 },
  V: { I: 55, vi: 22, V7: 10, IV: 7, iii: 6 },
  V7: { I: 70, vi: 25, IV: 5 },
  vi: { ii: 28, IV: 28, V: 15, iii: 9, I: 10, V7: 6, iv: 4 },
  '♭VII': { I: 45, IV: 35, V: 10, vi: 10 },
  'vii°': { I: 70, iii: 10, vi: 10, V: 10 },
};

const MINOR_TRANSITIONS: Table = {
  start: { i: 30, iv: 20, V: 15, VI: 15, III: 10, V7: 10 },
  i: { iv: 24, V: 18, VI: 17, III: 10, VII: 10, V7: 10, 'ii°': 6, v: 5 },
  'ii°': { V: 45, V7: 35, 'vii°7': 10, i: 5, iv: 5 },
  III: { VI: 34, iv: 24, VII: 20, i: 12, 'ii°': 10 },
  iv: { V: 28, i: 20, V7: 20, VII: 10, 'ii°': 10, VI: 12 },
  v: { i: 30, VI: 30, iv: 25, III: 15 },
  V: { i: 58, VI: 24, V7: 10, iv: 8 },
  V7: { i: 70, VI: 25, iv: 5 },
  VI: { iv: 28, 'ii°': 18, V: 20, III: 12, VII: 12, i: 10 },
  VII: { III: 45, i: 25, VI: 15, iv: 10, V: 5 },
  'vii°7': { i: 80, V: 10, III: 10 },
};

export function scaleChords(key: MusicalKey): ScaleChord[] {
  return key.mode === 'major' ? MAJOR : MINOR;
}

const CLASS_PCS: Record<ChordClass, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  dom7: [0, 4, 7, 10],
  hdim7: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
};

const CLASS_SUFFIX: Record<ChordClass, string> = {
  maj: '',
  min: 'm',
  dim: '°',
  aug: '+',
  dom7: '7',
  hdim7: 'm7♭5',
  dim7: '°7',
};

/** Erkannte Akkordqualität → Kandidatenklassen für die Stufensuche (in Reihenfolge der Passgenauigkeit). */
function compatibleClasses(q: ChordQuality): ChordClass[] {
  switch (q) {
    case 'maj':
    case 'maj7':
    case 'maj6':
    case 'sus2':
    case 'sus4':
      return ['maj', 'dom7'];
    case 'dom7':
      return ['dom7', 'maj'];
    case 'min':
    case 'min7':
    case 'min6':
      return ['min'];
    case 'dim':
      return ['dim', 'dim7', 'hdim7'];
    case 'hdim7':
      return ['hdim7', 'dim', 'dim7'];
    case 'dim7':
      return ['dim7', 'dim'];
    case 'aug':
      return ['aug', 'maj'];
    case 'other':
      return [];
  }
}

/** Stufe eines erkannten Akkords in der Tonart (oder null, wenn leiterfremd). */
export function romanFor(
  chord: Pick<DetectedChord, 'rootPc' | 'quality'>,
  key: MusicalKey,
): ScaleChord | null {
  const semis = pc(chord.rootPc - key.tonicPc);
  const table = scaleChords(key);
  for (const cls of compatibleClasses(chord.quality)) {
    const hit = table.find((c) => c.semitones === semis && c.cls === cls);
    if (hit) return hit;
  }
  return null;
}

export interface ChordSuggestion {
  numeral: string;
  symbol: string;
  root: string;
  rootPc: number;
  cls: ChordClass;
  fn: HarmonicFunction;
  /** Akkordtöne als Tonhöhenklassen, Grundton zuerst */
  pcs: number[];
  /** 0..1 */
  probability: number;
}

export function chordFromScale(sc: ScaleChord, key: MusicalKey): Omit<ChordSuggestion, 'probability'> {
  const root = Note.pitchClass(Note.transpose(keyTonicName(key), sc.interval)) || 'C';
  const rootPc = pc(key.tonicPc + sc.semitones);
  return {
    numeral: sc.numeral,
    symbol: `${root}${CLASS_SUFFIX[sc.cls]}`,
    root,
    rootPc,
    cls: sc.cls,
    fn: sc.fn,
    pcs: CLASS_PCS[sc.cls].map((i) => pc(rootPc + i)),
  };
}

/**
 * Die wahrscheinlichsten Folgeakkorde nach dem aktuellen Akkord (Übergangstabelle der Tonart).
 * Ohne erkannten oder bei leiterfremdem Akkord: typische Akkorde der Tonart.
 */
export function suggestNext(
  current: Pick<DetectedChord, 'rootPc' | 'quality'> | null,
  key: MusicalKey,
  count = 6,
): ChordSuggestion[] {
  const transitions = key.mode === 'major' ? MAJOR_TRANSITIONS : MINOR_TRANSITIONS;
  const from = current ? romanFor(current, key) : null;
  const row = (from && transitions[from.numeral]) ?? transitions.start ?? {};
  const table = scaleChords(key);
  const merged: Record<string, number> = { ...row };
  // Kurze Zeilen (z. B. nach V7) mit typischen Akkorden der Tonart auffüllen – deutlich schwächer gewichtet
  if (Object.keys(row).length < MIN_SUGGESTIONS + 1) {
    const rowTotal = Object.values(row).reduce((a, b) => a + b, 0) || 1;
    for (const [numeral, w] of Object.entries(transitions.start ?? {})) {
      if (!(numeral in merged)) merged[numeral] = (w / 100) * rowTotal * 0.15;
    }
  }
  const entries = Object.entries(merged).filter(([numeral]) => numeral !== from?.numeral);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return (
    entries
      .map(([numeral, w]) => {
        const sc = table.find((c) => c.numeral === numeral);
        return sc ? { ...chordFromScale(sc, key), probability: total > 0 ? w / total : 0 } : null;
      })
      .filter((x): x is ChordSuggestion => x !== null)
      // gleicher Grundton wie der aktuelle Akkord (z. B. G nach G7) ist kein sinnvoller „nächster“ Akkord
      .filter((x) => !current || x.rootPc !== pc(current.rootPc))
      .sort((a, b) => b.probability - a.probability)
      .slice(0, count)
  );
}

/** Tonhöhenklassen der Tonleiter (Dur bzw. harmonisch Moll) */
export function scalePcs(key: MusicalKey): number[] {
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
  return steps.map((s) => pc(key.tonicPc + s));
}

export interface Voicing {
  /** Linke Hand */
  bass: number;
  /** Rechte Hand */
  upper: number[];
}

/**
 * Spielbare Lage für Ghost-Notes: Grundton als Bass (C2–H2), Akkord eng in der rechten Hand.
 * Mit Referenz (z. B. vorheriger Akkord) wird die Umkehrung mit der kleinsten Bewegung gewählt.
 */
export function voiceChord(rootPc: number, pcs: readonly number[], reference?: readonly number[]): Voicing {
  const bass = 36 + pc(rootPc);
  const unique = [...new Set(pcs.map(pc))];
  const candidates: number[][] = [];
  for (let inv = 0; inv < unique.length; inv++) {
    const order = [...unique.slice(inv), ...unique.slice(0, inv)];
    for (const startOct of [48, 60, 72]) {
      const notes: number[] = [];
      let last = -Infinity;
      for (const p of order) {
        let m = startOct + p;
        while (m <= last) m += 12;
        notes.push(m);
        last = m;
      }
      if (notes[0]! >= 55 && notes[notes.length - 1]! <= 81) candidates.push(notes);
    }
  }
  const center = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ref = reference && reference.length > 0 ? [...reference].sort((a, b) => a - b) : null;
  const cost = (c: number[]) => {
    if (!ref) return Math.abs(center(c) - 66);
    // Summe der Abstände jeder Stimme zum nächsten Ton der Referenz
    return c.reduce((s, m) => s + Math.min(...ref.map((r) => Math.abs(r - m))), 0);
  };
  candidates.sort((a, b) => cost(a) - cost(b));
  return { bass, upper: candidates[0] ?? unique.map((p) => 60 + p) };
}

/**
 * Akkorde, die an einer Stelle ebenfalls passen würden: Leitereigene Akkorde, deren Töne die gespielten Töne
 * (gewichtet) abdecken, bevorzugt mit derselben Funktion wie der tatsächliche Akkord.
 */
export function alternativesFor(
  weights: readonly number[],
  actual: Pick<DetectedChord, 'rootPc' | 'quality'> | null,
  key: MusicalKey,
  max = 3,
  minCoverage = 0.6,
): (ChordSuggestion & { coverage: number })[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return [];
  const actualSc = actual ? romanFor(actual, key) : null;
  const seenRoots = new Set<string>();
  const out: (ChordSuggestion & { coverage: number; score: number })[] = [];
  for (const sc of scaleChords(key)) {
    const c = chordFromScale(sc, key);
    if (actual && c.rootPc === actual.rootPc) continue;
    const coverage = c.pcs.reduce((s, p) => s + (weights[p] ?? 0), 0) / total;
    if (coverage < minCoverage) continue;
    const score = coverage + (actualSc && actualSc.fn === sc.fn ? 0.15 : 0);
    out.push({ ...c, probability: coverage, coverage, score });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .filter((c) => {
      // pro Grundton nur eine Variante (z. B. V statt V und V7)
      const k = String(c.rootPc);
      if (seenRoots.has(k)) return false;
      seenRoots.add(k);
      return true;
    })
    .slice(0, max)
    .map(({ score: _score, ...rest }) => rest);
}
