import { Chord, Note } from 'tonal';
import { pc } from '../key-detection/key';

export type ChordQuality =
  | 'maj'
  | 'min'
  | 'dim'
  | 'aug'
  | 'dom7'
  | 'maj7'
  | 'min7'
  | 'hdim7'
  | 'dim7'
  | 'sus4'
  | 'sus2'
  | 'maj6'
  | 'min6'
  | 'other';

export interface DetectedChord {
  /** Anzeigename, z. B. "Am7/E" */
  symbol: string;
  root: string;
  rootPc: number;
  bass: string;
  bassPc: number;
  quality: ChordQuality;
  /** tonal-Typname, z. B. "minor seventh" */
  typeName: string;
  /** 0 = Grundstellung, 1 = 1. Umkehrung … ; −1 = Basston ist kein Akkordton */
  inversion: number;
  /** Akkordtöne als Tonhöhenklassen, Grundton zuerst */
  pcs: number[];
  /** Symbol-Suffix ohne Grundton/Bass, z. B. "m7" */
  suffix: string;
}

interface TypeInfo {
  quality: ChordQuality;
  suffix: string;
  /** Gebräuchlichkeit – entscheidet bei mehrdeutigen Tönen (z. B. Am7/E vs. C6/E) */
  weight: number;
}

const TYPES: Record<string, TypeInfo> = {
  major: { quality: 'maj', suffix: '', weight: 100 },
  minor: { quality: 'min', suffix: 'm', weight: 98 },
  'dominant seventh': { quality: 'dom7', suffix: '7', weight: 95 },
  'minor seventh': { quality: 'min7', suffix: 'm7', weight: 90 },
  'major seventh': { quality: 'maj7', suffix: 'maj7', weight: 88 },
  diminished: { quality: 'dim', suffix: '°', weight: 85 },
  'half-diminished': { quality: 'hdim7', suffix: 'm7♭5', weight: 84 },
  'diminished seventh': { quality: 'dim7', suffix: '°7', weight: 83 },
  'suspended fourth': { quality: 'sus4', suffix: 'sus4', weight: 80 },
  'suspended second': { quality: 'sus2', suffix: 'sus2', weight: 76 },
  sixth: { quality: 'maj6', suffix: '6', weight: 72 },
  'minor sixth': { quality: 'min6', suffix: 'm6', weight: 70 },
  augmented: { quality: 'aug', suffix: '+', weight: 68 },
  'dominant ninth': { quality: 'dom7', suffix: '9', weight: 66 },
  'major ninth': { quality: 'maj7', suffix: 'maj9', weight: 64 },
  'minor ninth': { quality: 'min7', suffix: 'm9', weight: 64 },
  'suspended fourth seventh': { quality: 'dom7', suffix: '7sus4', weight: 62 },
};

const DEFAULT_WEIGHT = 30;
const ROOT_POSITION_BONUS = 20;

function prettify(suffix: string): string {
  return suffix.replace(/b(\d)/g, '♭$1').replace(/#(\d)/g, '♯$1');
}

/**
 * Erkennt einen Akkord aus Tonhöhenklassen mit gegebenem Basston.
 * tonal liefert mehrere Deutungen; die gebräuchlichste gewinnt (Grundstellung leicht bevorzugt).
 */
export function detectChordFromPcs(
  pcs: readonly number[],
  bassPc: number,
  spell: (pc: number) => string,
): DetectedChord | null {
  const unique = [...new Set(pcs.map(pc))];
  if (unique.length < 3) return null;
  const ordered = [pc(bassPc), ...unique.filter((p) => p !== pc(bassPc))];
  const names = ordered.map(spell);
  const candidates = Chord.detect(names);

  let best: { chord: DetectedChord; score: number } | null = null;
  for (const name of candidates) {
    const c = Chord.get(name);
    if (c.empty || !c.tonic) continue;
    const info = TYPES[c.type];
    const rootPc = Note.chroma(c.tonic);
    if (rootPc === undefined || Number.isNaN(rootPc)) continue;
    const chordPcs = Chord.getChord(c.type, c.tonic).notes.map((n) => Note.chroma(n) ?? 0);
    const inversion = chordPcs.indexOf(pc(bassPc));
    const root = spell(rootPc);
    const bass = spell(bassPc);
    const suffix = prettify(info ? info.suffix : (c.aliases[0] ?? ''));
    const chord: DetectedChord = {
      symbol: `${root}${suffix}${rootPc === pc(bassPc) ? '' : `/${bass}`}`,
      root,
      rootPc,
      bass,
      bassPc: pc(bassPc),
      quality: info?.quality ?? 'other',
      typeName: c.type,
      inversion,
      pcs: chordPcs,
      suffix,
    };
    // Grundstellung deutlich bevorzugen: C-E-G-A mit C im Bass = C6, mit E im Bass dagegen Am7/E
    const score = (info?.weight ?? DEFAULT_WEIGHT) + (rootPc === pc(bassPc) ? ROOT_POSITION_BONUS : 0);
    if (!best || score > best.score) best = { chord, score };
  }
  return best?.chord ?? null;
}

/** Gebräuchlichkeit eines Akkords (für den Vergleich verschiedener Lesarten). */
export function chordScore(c: DetectedChord): number {
  return (TYPES[c.typeName]?.weight ?? DEFAULT_WEIGHT) + (c.rootPc === c.bassPc ? ROOT_POSITION_BONUS : 0);
}

/** Gleicher Akkord mit anderem Basston (z. B. nach dem Zusammenfassen von Abschnitten). */
export function withBass(c: DetectedChord, bassPc: number, spell: (pc: number) => string): DetectedChord {
  const b = pc(bassPc);
  const bass = spell(b);
  return {
    ...c,
    bass,
    bassPc: b,
    inversion: c.pcs.indexOf(b),
    symbol: `${c.root}${c.suffix}${c.rootPc === b ? '' : `/${bass}`}`,
  };
}

/** Gleicher Akkord, neu benannt (z. B. nach Tonartwechsel: C# → Db). */
export function respell(c: DetectedChord, spell: (pc: number) => string): DetectedChord {
  const root = spell(c.rootPc);
  const bass = spell(c.bassPc);
  return { ...c, root, bass, symbol: `${root}${c.suffix}${c.rootPc === c.bassPc ? '' : `/${bass}`}` };
}

/** Gehört der Akkordtyp zu den gebräuchlichen (bekannten) Typen? */
export function isCommonChord(c: DetectedChord): boolean {
  return c.typeName in TYPES;
}

/**
 * Akkord aus gerade klingenden MIDI-Noten (tiefste Note = Bass).
 * Ergibt die volle Tonmenge nur einen exotischen Typ (z. B. bei Clustern), wird die gebräuchlichste Teilmenge
 * gesucht, die möglichst viele Töne abdeckt – „C“ mit Zusatztönen statt „Em♭6♭9/C“.
 */
export function detectChord(midis: Iterable<number>, spell: (pc: number) => string): DetectedChord | null {
  const list = [...midis];
  if (list.length < 3) return null;
  const bass = Math.min(...list);
  const full = detectChordFromPcs(list, bass, spell);
  if (full && isCommonChord(full)) return full;

  const pcs = [...new Set(list.map(pc))];
  if (pcs.length < 3 || pcs.length > 7) return full;
  const bassPc = pc(bass);
  let best: { chord: DetectedChord; score: number } | null = null;
  for (let mask = 1; mask < 1 << pcs.length; mask++) {
    const subset = pcs.filter((_, i) => mask & (1 << i));
    if (subset.length < 3 || subset.length === pcs.length) continue;
    const hasBass = subset.includes(bassPc);
    const chord = detectChordFromPcs(subset, hasBass ? bassPc : subset[0]!, spell);
    if (!chord || !isCommonChord(chord)) continue;
    const score = chordScore(chord) + 40 * (subset.length / pcs.length) - (hasBass ? 0 : 15);
    if (!best || score > best.score) best = { chord, score };
  }
  if (!best) return full;
  // Basston beibehalten, auch wenn er kein Akkordton ist (z. B. „C/D“)
  return best.chord.bassPc === bassPc ? best.chord : withBass(best.chord, bassPc, spell);
}

const INVERSION_LABEL = ['Grundstellung', '1. Umkehrung', '2. Umkehrung', '3. Umkehrung'];

/** Beschreibung auf Deutsch, z. B. „Moll-Septakkord, 2. Umkehrung“. */
export function describeChord(c: DetectedChord): string {
  const names: Record<ChordQuality, string> = {
    maj: 'Dur-Dreiklang',
    min: 'Moll-Dreiklang',
    dim: 'verminderter Dreiklang',
    aug: 'übermäßiger Dreiklang',
    dom7: 'Dominantseptakkord',
    maj7: 'großer Septakkord (maj7)',
    min7: 'Moll-Septakkord',
    hdim7: 'halbverminderter Septakkord',
    dim7: 'verminderter Septakkord',
    sus4: 'Quartvorhalt (sus4)',
    sus2: 'Sekundvorhalt (sus2)',
    maj6: 'Dur mit Sexte',
    min6: 'Moll mit Sexte',
    other: c.typeName || 'Akkord',
  };
  const inv =
    c.inversion < 0 ? `Bass ${c.bass}` : (INVERSION_LABEL[c.inversion] ?? `${c.inversion}. Umkehrung`);
  return `${names[c.quality]}, ${inv}`;
}
