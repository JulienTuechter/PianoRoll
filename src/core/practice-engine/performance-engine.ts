import type { MidiInputEvent } from '../midi-input/types';
import { measureIndexAt, type MeasureInfo } from '../note-event-model/tempo-map';
import type { NoteEvent } from '../note-event-model/types';
import type { Transport } from '../playback/transport';
import {
  buildResult,
  emptyStats,
  recordError,
  recordHit,
  recordMissed,
  summarizeTiming,
  type RunStats,
  type TimingWindows,
} from '../scoring/scoring';
import type { Clock } from '../time/clock';
import { isPracticed, type HandFilter } from '../wait-mode-engine/wait-mode-engine';
import type { EngineEvent, KeyJudgement, PlayEngine } from './engine-types';

export interface PerformanceConfig extends TimingWindows {
  hands: HandFilter;
  /** Systemlatenz (Ausgabe + Eingabe); wird vom Zeitstempel jedes Anschlags abgezogen */
  latencyMs: number;
}

const OPEN = 0;
const HIT = 1;
const DONE = 2; // verpasst oder übersprungen

/**
 * Performance-Modus: Das Stück läuft in Echtzeit, jede Taste wird der nächstgelegenen offenen Note
 * gleicher Tonhöhe zugeordnet und nach Timing bewertet. Nicht gespielte Noten werden zu „verpasst“,
 * sobald sie das Fangfenster verlassen haben.
 */
export class PerformanceEngine implements PlayEngine {
  readonly mode = 'performance' as const;
  readonly notes: NoteEvent[];
  private state: Uint8Array;
  private cursor = 0;
  private rangeStart = 0;
  private rangeEnd = Infinity;
  private _stats: RunStats = emptyStats();
  private runStartMs = 0;
  private finished = false;
  private jumped = false;
  private lastPos = 0;
  readonly keyJudgements = new Map<number, KeyJudgement>();
  readonly expectedKeys = null;
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly clock: Clock,
    notes: readonly NoteEvent[],
    readonly config: PerformanceConfig,
    private readonly measures: readonly MeasureInfo[] = [],
  ) {
    this.notes = notes
      .filter((n) => isPracticed(n.hand, config.hands))
      .sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
    this.state = new Uint8Array(this.notes.length);
    let prev = transport.state;
    this.unsubscribe.push(
      transport.onStateChange((s) => {
        if (s === 'ended') this.finish();
        if (s === 'playing' && (prev === 'stopped' || prev === 'ended')) this.restart();
        prev = s;
      }),
      transport.onSeek((pos) => {
        // Ein Seek auf (fast) dieselbe Stelle – z. B. Count-in beim Fortsetzen – ist kein Sprung
        if (Math.abs(pos - this.lastPos) > 0.25) this.jumped = true;
        this.syncTo(pos);
      }),
    );
    this.restart();
  }

  get stats(): Readonly<RunStats> {
    return this._stats;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  on(l: (e: EngineEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.listeners.clear();
  }

  restart(): void {
    this._stats = emptyStats();
    this.finished = false;
    this.jumped = false;
    this.runStartMs = this.clock.now();
    this.syncTo(Math.max(this.transport.position, this.rangeStart));
    this.lastPos = this.transport.position;
  }

  setRange(startSec: number, endSec: number | null): void {
    this.rangeStart = startSec;
    this.rangeEnd = endSec ?? Infinity;
    this.syncTo(Math.max(this.transport.position, startSec));
  }

  /** Noten ab `pos` werden (wieder) offen, frühere offene als übersprungen markiert. */
  syncTo(pos: number): void {
    const from = Math.max(pos, this.rangeStart);
    this.cursor = this.notes.length;
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.startSec >= from - 1e-6 && n.startSec < this.rangeEnd) {
        this.state[i] = OPEN;
        if (i < this.cursor) this.cursor = i;
      } else if (this.state[i] === OPEN) this.state[i] = DONE;
    }
    this.lastPos = from;
  }

  completePass(): void {
    this.sweepMisses(this.rangeEnd);
    this.syncTo(this.rangeStart);
  }

  private measureAt(sec: number): number {
    return measureIndexAt(this.measures, sec);
  }

  /** Fangfenster in Songsekunden (Fenster sind in Echtzeit-ms definiert). */
  private catchSongSec(): number {
    return (this.config.catchMs / 1000) * this.transport.rate;
  }

  handleInput(e: MidiInputEvent): void {
    if (e.type === 'noteoff') {
      this.keyJudgements.delete(e.midi);
      return;
    }
    if (e.type !== 'noteon' || this.transport.state !== 'playing' || this.finished) return;

    const songT = this.transport.positionAt(e.timeMs - this.config.latencyMs);
    this.lastPos = Math.max(this.lastPos, songT);
    const window = this.catchSongSec();
    let best = -1;
    let bestDist = Infinity;
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i]!;
      if (n.startSec > songT + window) break;
      if (this.state[i] !== OPEN || n.midi !== e.midi) continue;
      const dist = Math.abs(n.startSec - songT);
      if (dist <= window && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }

    if (best < 0) {
      recordError(this._stats, this.measureAt(songT));
      this.keyJudgements.set(e.midi, 'wrong');
      this.emit({ type: 'wrong', midi: e.midi, counted: true, group: -1 });
      return;
    }

    const note = this.notes[best]!;
    this.state[best] = HIT;
    const offsetMs = ((songT - note.startSec) / this.transport.rate) * 1000;
    const grade = recordHit(this._stats, offsetMs, this.config, this.measureAt(note.startSec));
    this.keyJudgements.set(e.midi, grade === 'perfect' ? 'correct' : offsetMs < 0 ? 'early' : 'late');
    this.emit({ type: 'hit', midi: e.midi, grade, offsetMs });
  }

  update(): void {
    if (this.transport.state !== 'playing') return;
    const pos = this.transport.position;
    this.lastPos = Math.max(this.lastPos, pos);
    this.sweepMisses(pos - this.catchSongSec());
  }

  /** Alle offenen Noten mit Start vor `untilSec` gelten als verpasst. */
  private sweepMisses(untilSec: number): void {
    while (this.cursor < this.notes.length) {
      const n = this.notes[this.cursor]!;
      if (n.startSec >= untilSec || n.startSec >= this.rangeEnd) break;
      if (this.state[this.cursor] === OPEN) {
        this.state[this.cursor] = DONE;
        recordMissed(this._stats, this.measureAt(n.startSec));
        this.emit({ type: 'missed', midi: n.midi, noteId: n.id });
      }
      this.cursor++;
    }
  }

  get expectedTotal(): number {
    return this.notes.filter((n) => n.startSec >= this.rangeStart - 1e-6 && n.startSec < this.rangeEnd)
      .length;
  }

  private finish(): void {
    if (this.finished) return;
    this.sweepMisses(Infinity);
    this.finished = true;
    const total = this.expectedTotal;
    const judged = this._stats.correctNotes + this._stats.missedNotes;
    this.emit({
      type: 'finished',
      result: buildResult(this._stats, {
        mode: 'performance',
        hands: this.config.hands,
        rate: this.transport.rate,
        totalGroups: total,
        completedGroups: judged,
        complete: !this.jumped && judged >= total,
        measureCount: this.measures.length,
        durationMs: this.clock.now() - this.runStartMs,
        finishedAt: Date.now(),
        timing: summarizeTiming(this._stats, total, this.config),
      }),
    });
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }
}
