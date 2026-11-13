export type Hand = 'left' | 'right';

/** Einheitliches Notenmodell für Dateien, Aufnahmen und Engines. */
export interface NoteEvent {
  id: string;
  midi: number;
  startTick: number;
  startSec: number;
  durationSec: number;
  /** 0..1 */
  velocity: number;
  hand: Hand;
  /** Index in Song.tracks */
  track: number;
}

export interface TempoChange {
  tick: number;
  bpm: number;
  /** Zeitpunkt in Sekunden, an dem dieser Tempowechsel greift */
  sec: number;
}

export interface TimeSignatureChange {
  tick: number;
  numerator: number;
  denominator: number;
  /** Taktindex (0-basiert), an dem der Wechsel greift */
  measure: number;
}

export interface KeySignatureChange {
  tick: number;
  /** z. B. "C", "F#" */
  key: string;
  scale: 'major' | 'minor';
}

export type HandAssignment = Hand | 'split';

export interface TrackInfo {
  index: number;
  name: string;
  instrument: string;
  /** GM-Programmnummer, -1 falls unbekannt */
  program: number;
  isPercussion: boolean;
  noteCount: number;
  /** Wie die Noten dieses Tracks den Händen zugeordnet werden */
  handAssignment: HandAssignment;
  /** Track ist stummgeschaltet / ignoriert */
  enabled: boolean;
}

export interface Song {
  id: string;
  title: string;
  durationSec: number;
  ppq: number;
  tempos: TempoChange[];
  timeSignatures: TimeSignatureChange[];
  keySignatures: KeySignatureChange[];
  tracks: TrackInfo[];
  /** sortiert nach startSec, dann midi */
  notes: NoteEvent[];
  /** Split-Punkt (MIDI) für Tracks mit handAssignment 'split'; Noten < splitPoint → links */
  splitPoint: number;
}

export const PIANO_MIN_MIDI = 21; // A0
export const PIANO_MAX_MIDI = 108; // C8
export const MIDDLE_C = 60;
