import type { HandAssignment } from '../note-event-model/types';
import type { RunResult } from '../scoring/scoring';

export type SongSource = 'file' | 'demo' | 'recording';

export interface TrackOverride {
  handAssignment: HandAssignment;
  enabled: boolean;
}

/** Metadaten eines Stücks in der Bibliothek (ohne Dateiinhalt, damit die Liste leicht bleibt). */
export interface LibraryEntry {
  id: string;
  title: string;
  fileName: string;
  source: SongSource;
  addedAt: number;
  durationSec: number;
  bpm: number;
  noteCount: number;
  /** Manuelle Hände-/Spur-Korrektur, Index = Track-Index */
  trackOverrides: TrackOverride[] | null;
  splitPoint: number | null;
  lastPracticedAt: number | null;
  /** 0..1 */
  bestAccuracy: number | null;
  runCount: number;
}

export interface StoredRun {
  songId: string;
  result: RunResult;
}

export interface LibraryRepository {
  list(): Promise<LibraryEntry[]>;
  get(id: string): Promise<LibraryEntry | undefined>;
  getBytes(id: string): Promise<Uint8Array | undefined>;
  /** Legt an oder ersetzt Metadaten; Bytes optional (bleiben sonst erhalten). */
  put(entry: LibraryEntry, bytes?: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
  addRun(run: StoredRun): Promise<void>;
  runs(songId: string): Promise<StoredRun[]>;
  getSetting<T>(key: string): Promise<T | undefined>;
  setSetting<T>(key: string, value: T): Promise<void>;
}
