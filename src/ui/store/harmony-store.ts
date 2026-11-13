import { create } from 'zustand';
import type { ChordSegment } from '../../core/chord-detection/song-chords';
import type { DetectedChord } from '../../core/chord-detection/chord';
import type { ChordSuggestion } from '../../core/harmony-suggestions/harmony';
import type { MusicalKey } from '../../core/key-detection/key';

export type KeySource = 'manual' | 'auto' | 'song' | 'none';

export interface SuggestionChip extends ChordSuggestion {
  bass: number;
  upper: number[];
}

interface HarmonyState {
  /** Freispiel: zuletzt erkannter Akkord und ob er gerade noch klingt */
  chord: DetectedChord | null;
  chordSounding: boolean;
  /** Römische Stufe des Akkords in der Tonart */
  chordNumeral: string | null;
  key: MusicalKey | null;
  keySource: KeySource;
  keyConfidence: number;
  suggestions: SuggestionChip[];
  /** Stück */
  songKey: MusicalKey | null;
  segments: ChordSegment[];
  /** Angepinnter Vorschlag (Ghost-Notes bleiben sichtbar) */
  pinned: string | null;
  set(partial: Partial<Omit<HarmonyState, 'set'>>): void;
}

export const useHarmony = create<HarmonyState>()((set) => ({
  chord: null,
  chordSounding: false,
  chordNumeral: null,
  key: null,
  keySource: 'none',
  keyConfidence: 0,
  suggestions: [],
  songKey: null,
  segments: [],
  pinned: null,
  set: (partial) => set(partial),
}));
