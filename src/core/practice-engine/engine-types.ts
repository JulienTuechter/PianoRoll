import type { MidiInputEvent } from '../midi-input/types';
import type { Hand } from '../note-event-model/types';
import type { RunResult, RunStats, TimingGrade } from '../scoring/scoring';

/** Bewertung einer gehaltenen Taste für die Feedback-Farben. */
export type KeyJudgement = 'correct' | 'wrong' | 'early' | 'late';

export type EngineEvent =
  | { type: 'correct'; midi: number; group: number }
  | { type: 'wrong'; midi: number; counted: boolean; group: number }
  | { type: 'group-complete'; group: number; hadErrors: boolean }
  | { type: 'hint'; group: number }
  | { type: 'hit'; midi: number; grade: TimingGrade; offsetMs: number }
  | { type: 'missed'; midi: number; noteId: string }
  | { type: 'finished'; result: RunResult };

/** Gemeinsame Schnittstelle von Wait- und Performance-Engine für Runtime und Renderer. */
export interface PlayEngine {
  readonly mode: 'wait' | 'performance';
  readonly stats: Readonly<RunStats>;
  readonly keyJudgements: ReadonlyMap<number, KeyJudgement>;
  /** Erwartete Tasten (Wait: aktuelle Gruppe), sonst null */
  readonly expectedKeys: ReadonlyMap<number, Hand> | null;
  handleInput(e: MidiInputEvent): void;
  /** Regelmäßig aufrufen (z. B. alle 25 ms) */
  update(): void;
  /** Nur Noten in [startSec, endSec) zählen (Loop). endSec null = bis zum Ende. */
  setRange(startSec: number, endSec: number | null): void;
  /** Loop-Ende erreicht: offene Noten des Bereichs abschließen, Bereich für den nächsten Durchlauf zurücksetzen. */
  completePass(): void;
  on(listener: (e: EngineEvent) => void): () => void;
  dispose(): void;
}
