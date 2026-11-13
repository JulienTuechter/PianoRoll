import type { NoteEvent } from './types';

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

export function isBlackKey(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

/** "C4" für 60 (wissenschaftliche Notation, C4 = Mittel-C). */
export function midiToName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NAMES_SHARP[pc] ?? '?'}${octave}`;
}

export function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
}

/**
 * Gruppiert Noten, deren Beginn innerhalb von `windowSec` nach dem ersten Ton der Gruppe liegt.
 * Erwartet nach startSec sortierte Noten.
 */
export function groupByOnset(notes: readonly NoteEvent[], windowSec = 0.04): NoteEvent[][] {
  const groups: NoteEvent[][] = [];
  let current: NoteEvent[] = [];
  let groupStart = -Infinity;
  for (const n of notes) {
    if (current.length > 0 && n.startSec - groupStart <= windowSec) {
      current.push(n);
    } else {
      if (current.length > 0) groups.push(current);
      current = [n];
      groupStart = n.startSec;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Index der ersten Note, deren Ende nach `sec` liegt – Startpunkt fürs Rendern sichtbarer Noten.
 * Lineare Suche rückwärts ab einer binären Suche nach Start, da Noten lang sein können.
 */
export function firstNoteIndexAtOrAfter(notes: readonly NoteEvent[], sec: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const n = notes[mid];
    if (n && n.startSec < sec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
