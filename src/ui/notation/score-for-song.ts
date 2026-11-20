import { analyzeSongChords, harmonicWindows } from '../../core/chord-detection/song-chords';
import { speller, type MusicalKey } from '../../core/key-detection/key';
import { buildNotation, type ChordLabel, type NotationScore } from '../../core/notation-builder/notation';
import type { MeasureInfo, TempoMap } from '../../core/note-event-model/tempo-map';
import type { NoteEvent, PedalSpan } from '../../core/note-event-model/types';
import { buildBeatGrid } from '../../core/practice-engine/beats';

/** Zusätzliche Zeichen im Notenbild (Einstellungen „Notenschrift“) */
export interface ScoreMarks {
  chords: boolean;
  pedal: boolean;
  dynamics: boolean;
}

export const ALL_MARKS: ScoreMarks = { chords: true, pedal: true, dynamics: true };
export const NO_MARKS: ScoreMarks = { chords: false, pedal: false, dynamics: false };

/** „Bb“ → „B♭“, „F#m7/C#“ → „F♯m7/C♯“ (nur Vorzeichen direkt nach einem Notennamen) */
export function prettyChord(symbol: string): string {
  return symbol.replace(/([A-G])(#|b)/g, (_, l: string, a: string) => `${l}${a === '#' ? '♯' : '♭'}`);
}

/** Akkordfolge des Stücks als Akkordsymbole (wie im Harmonie-Panel erkannt). */
export function chordLabels(
  notes: readonly NoteEvent[],
  measures: readonly MeasureInfo[],
  ppq: number,
  key: MusicalKey | null,
  tempoMap: TempoMap,
): ChordLabel[] {
  if (notes.length === 0 || measures.length === 0) return [];
  const endSec = notes.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0);
  const windows = harmonicWindows(measures, buildBeatGrid(measures, ppq, tempoMap), endSec);
  const out: ChordLabel[] = [];
  for (const seg of analyzeSongChords(notes, windows, speller(key))) {
    const c = seg.chord;
    if (!c) continue;
    out.push({
      tick: Math.round(tempoMap.secToTick(seg.startSec)),
      label: prettyChord(c.symbol),
      root: c.root,
      bass: c.bass,
      quality: c.quality,
      suffix: c.suffix,
    });
  }
  return out;
}

/** Notenbild-Modell eines Stücks (gemeinsam für Notenansicht, Export und Aufnahme-Vorschau). */
export function scoreFor(
  notes: readonly NoteEvent[],
  measures: readonly MeasureInfo[],
  ppq: number,
  key: MusicalKey | null,
  tempoMap: TempoMap | null,
  marks: ScoreMarks = NO_MARKS,
  pedals: readonly PedalSpan[] = [],
): NotationScore {
  return buildNotation(notes, measures, ppq, {
    key,
    secToTick: tempoMap ? (sec) => tempoMap.secToTick(sec) : undefined,
    chords: marks.chords && tempoMap ? chordLabels(notes, measures, ppq, key, tempoMap) : [],
    pedals: marks.pedal ? pedals : [],
    dynamics: marks.dynamics,
  });
}

/** Zeichen laut Einstellungen */
export function marksFrom(s: {
  notationChords: boolean;
  notationPedal: boolean;
  notationDynamics: boolean;
}): ScoreMarks {
  return { chords: s.notationChords, pedal: s.notationPedal, dynamics: s.notationDynamics };
}
