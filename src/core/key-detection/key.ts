import { Note } from 'tonal';

export type Mode = 'major' | 'minor';

export interface MusicalKey {
  /** Tonika als Tonhöhenklasse 0..11 (0 = C) */
  tonicPc: number;
  mode: Mode;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
/** Übliche Schreibweise der Tonika je Tonart */
const MAJOR_TONIC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_TONIC = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

export function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}

export function keyTonicName(k: MusicalKey): string {
  return (k.mode === 'major' ? MAJOR_TONIC : MINOR_TONIC)[pc(k.tonicPc)] ?? 'C';
}

/** Hat die Tonart b-Vorzeichen? (bestimmt die Schreibweise der Töne) */
export function keyUsesFlats(k: MusicalKey | null): boolean {
  if (!k) return false;
  const name = keyTonicName(k);
  if (name.includes('b')) return true;
  // F-Dur sowie d-, g-, c-, f-Moll haben b-Vorzeichen
  return k.mode === 'major' ? name === 'F' : ['D', 'G', 'C', 'F'].includes(name);
}

export function pcName(pitchClass: number, flats: boolean): string {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc(pitchClass)] ?? 'C';
}

/**
 * Intervall zur Tonika je Halbtonabstand – für Dur und Moll gleich:
 * leitereigene Töne über ihre Stufe, leiterfremde als ♭2, ♭3/♮3, ♯4, ♭6/♮6, ♭7/♮7.
 * Beispiele: Bb in G-Dur (♭3), F# in C-Dur (♯4), G# in a-Moll (Leitton), E# in F#-Dur.
 */
const DEGREE_INTERVALS = ['1P', '2m', '2M', '3m', '3M', '4P', '4A', '5P', '6m', '6M', '7m', '7M'] as const;

/** Schreibweise von Tonhöhenklassen passend zur Tonart (ohne Tonart: Kreuze). */
export function speller(k: MusicalKey | null): (pitchClass: number) => string {
  if (!k) return (p) => pcName(p, false);
  const tonic = keyTonicName(k);
  const names = DEGREE_INTERVALS.map((iv) => Note.pitchClass(Note.transpose(tonic, iv)) || 'C');
  return (p) => names[pc(p - k.tonicPc)] ?? pcName(p, false);
}

/** Deutsche Bezeichnung: „C-Dur“, „a-Moll“ (Moll klein geschrieben). */
export function keyLabel(k: MusicalKey): string {
  const name = keyTonicName(k).replace('b', '♭').replace('#', '♯');
  return k.mode === 'major' ? `${name}-Dur` : `${name.toLowerCase()}-Moll`;
}

export function sameKey(a: MusicalKey | null, b: MusicalKey | null): boolean {
  return a !== null && b !== null && a.tonicPc === b.tonicPc && a.mode === b.mode;
}

/** Alle 24 Tonarten (für die manuelle Auswahl), C-Dur zuerst */
export function allKeys(): MusicalKey[] {
  const out: MusicalKey[] = [];
  for (let p = 0; p < 12; p++) out.push({ tonicPc: p, mode: 'major' });
  for (let p = 0; p < 12; p++) out.push({ tonicPc: (p + 9) % 12, mode: 'minor' });
  return out;
}

/** "G" + 'major' (aus MIDI-Datei) → MusicalKey */
export function parseKey(name: string, mode: Mode): MusicalKey | null {
  const m = /^([A-G])([#b]?)$/.exec(name.trim());
  if (!m?.[1]) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return { tonicPc: pc(base + acc), mode };
}

const MAJOR_FIFTHS: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  Db: -5,
  Ab: -4,
  Eb: -3,
  Bb: -2,
  F: -1,
};
const MINOR_FIFTHS: Record<string, number> = {
  A: 0,
  E: 1,
  B: 2,
  'F#': 3,
  'C#': 4,
  'G#': 5,
  D: -1,
  G: -2,
  C: -3,
  F: -4,
  Bb: -5,
  Eb: -6,
};

/** Anzahl Vorzeichen (+ Kreuze, − Bs) der Tonart, wie in MIDI/MusicXML. */
export function keyFifths(k: MusicalKey | null): number {
  if (!k) return 0;
  const name = keyTonicName(k);
  return (k.mode === 'major' ? MAJOR_FIFTHS[name] : MINOR_FIFTHS[name]) ?? 0;
}
