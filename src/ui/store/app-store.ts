import { create } from 'zustand';
import type { LibraryEntry } from '../../core/library/types';
import type { WebMidiState } from '../../core/midi-input/web-midi';
import type { Song } from '../../core/note-event-model/types';
import type { TransportState } from '../../core/playback/transport';
import type { LoopRange } from '../../core/practice-engine/loop';
import type { PassSummary, RunResult } from '../../core/scoring/scoring';

export type AudioState = 'locked' | 'loading' | 'ready' | 'fallback';

interface AppState {
  ready: boolean;
  song: Song | null;
  error: string | null;
  midi: WebMidiState;
  audio: AudioState;
  transport: TransportState;
  rate: number;
  settingsOpen: boolean;
  libraryOpen: boolean;
  dragging: boolean;
  library: LibraryEntry[];
  lastResult: RunResult | null;
  resultsOpen: boolean;
  /** Ausgewählter Loop-Bereich (Takte) und ob er aktiv ist */
  loop: LoopRange | null;
  loopEnabled: boolean;
  /** Letzter abgeschlossener Loop-Durchlauf */
  lastPass: (PassSummary & { index: number; cleanStreak: number; tempoUp: number | null }) | null;
  /** Bibliotheks-Startansicht weggeklickt bzw. frei losgespielt (nur für diese Sitzung) */
  freePlay: boolean;
  set(partial: Partial<Omit<AppState, 'set'>>): void;
}

export const useApp = create<AppState>()((set) => ({
  ready: false,
  song: null,
  error: null,
  midi: { status: { kind: 'idle' }, devices: [], activeDeviceId: null },
  audio: 'locked',
  transport: 'stopped',
  rate: 1,
  settingsOpen: false,
  libraryOpen: false,
  dragging: false,
  library: [],
  lastResult: null,
  resultsOpen: false,
  loop: null,
  loopEnabled: false,
  lastPass: null,
  freePlay: false,
  set: (partial) => set(partial),
}));
