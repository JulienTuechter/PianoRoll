import { create } from 'zustand';
import type { LibraryEntry } from '../../core/library/types';
import type { WebMidiState } from '../../core/midi-input/web-midi';
import type { Song } from '../../core/note-event-model/types';
import type { TransportState } from '../../core/playback/transport';
import type { LoopRange } from '../../core/practice-engine/loop';
import type { Recording } from '../../core/recorder/recorder';
import type { PassSummary, RunResult } from '../../core/scoring/scoring';

export type AudioState = 'locked' | 'loading' | 'ready' | 'fallback';
/** Service Worker: 'ready' = gerade erstmals offline verfügbar, 'update' = neue Version wartet */
export type OfflineState = 'idle' | 'ready' | 'update';

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
  /** Stück, dessen Lernverlauf gerade angezeigt wird */
  historySongId: string | null;
  lastResult: RunResult | null;
  resultsOpen: boolean;
  /** Ausgewählter Loop-Bereich (Takte) und ob er aktiv ist */
  loop: LoopRange | null;
  loopEnabled: boolean;
  /** Letzter abgeschlossener Loop-Durchlauf */
  lastPass: (PassSummary & { index: number; cleanStreak: number; tempoUp: number | null }) | null;
  /** Bibliotheks-Startansicht weggeklickt bzw. frei losgespielt (nur für diese Sitzung) */
  freePlay: boolean;
  /** Läuft gerade eine Aufnahme? */
  recording: 'countin' | 'recording' | null;
  /** Letzte Aufnahme, die im Editor bearbeitet wird */
  take: Recording | null;
  offline: OfflineState;
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
  historySongId: null,
  lastResult: null,
  resultsOpen: false,
  loop: null,
  loopEnabled: false,
  lastPass: null,
  freePlay: false,
  recording: null,
  take: null,
  offline: 'idle',
  set: (partial) => set(partial),
}));
