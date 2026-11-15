import type { MidiInputEvent } from '../midi-input/types';
import { groupByOnset } from '../note-event-model/notes';
import { measureIndexAt, type MeasureInfo } from '../note-event-model/tempo-map';
import type { Hand, NoteEvent } from '../note-event-model/types';
import type { Transport } from '../playback/transport';
import {
  buildResult,
  emptyStats,
  recordCorrect,
  recordError,
  recordGroupComplete,
  type RunStats,
} from '../scoring/scoring';
import type { Clock } from '../time/clock';
import type { EngineEvent, KeyJudgement, PlayEngine } from '../practice-engine/engine-types';

export type HandFilter = 'both' | 'left' | 'right';

export interface WaitModeConfig {
  hands: HandFilter;
  /** Noten, die innerhalb dieses Fensters beginnen, bilden eine Gruppe */
  groupWindowSec: number;
  /** Wie lange eine losgelassene Akkordnote noch als „gehalten“ gilt */
  chordToleranceMs: number;
  /** Nach so vielen Fehlversuchen in einer Gruppe wird die Hinweisanzeige aktiv (0 = aus) */
  hintAfterErrors: number;
  /** Wie früh (Songzeit) vor einer Gruppe deren Noten schon angenommen werden */
  earlyWindowSec: number;
}

export const defaultWaitConfig: WaitModeConfig = {
  hands: 'both',
  groupWindowSec: 0.04,
  chordToleranceMs: 150,
  hintAfterErrors: 3,
  earlyWindowSec: 0.3,
};

export interface WaitGroup {
  index: number;
  startSec: number;
  measure: number;
  notes: NoteEvent[];
  /** Eindeutige Tonhöhen → Hand */
  expected: Map<number, Hand>;
}

export type { KeyJudgement };
export type WaitEvent = EngineEvent;

interface Press {
  onMs: number;
  offMs: number | null;
}

export function isPracticed(hand: Hand, filter: HandFilter): boolean {
  return filter === 'both' || filter === hand;
}

/** Bildet die zu spielenden Gruppen aus den Noten der geübten Hand(en). */
export function buildWaitGroups(
  notes: readonly NoteEvent[],
  config: Pick<WaitModeConfig, 'hands' | 'groupWindowSec'>,
  measures: readonly MeasureInfo[] = [],
): WaitGroup[] {
  const practiced = notes.filter((n) => isPracticed(n.hand, config.hands));
  return groupByOnset(practiced, config.groupWindowSec).map((g, index) => {
    const startSec = g[0]?.startSec ?? 0;
    const expected = new Map<number, Hand>();
    for (const n of g) if (!expected.has(n.midi)) expected.set(n.midi, n.hand);
    return { index, startSec, measure: measureIndexAt(measures, startSec), notes: g, expected };
  });
}

/**
 * Wait-Modus als Zustandsautomat über Transport + Clock + Input-Events.
 *
 * - Der Transport hält an der nächsten offenen Gruppe (Haltepunkt).
 * - Eine Gruppe ist erfüllt, wenn jede erwartete Tonhöhe seit Aktivierung der Gruppe angeschlagen wurde
 *   und zum Zeitpunkt des letzten Anschlags noch gehalten wird (oder vor höchstens chordToleranceMs losgelassen wurde).
 * - Falsche Noten brechen nichts ab, zählen aber als Fehler.
 */
export class WaitModeEngine implements PlayEngine {
  readonly mode = 'wait' as const;
  readonly groups: WaitGroup[];
  private current = 0;
  private rangeStart = 0;
  private rangeEnd = Infinity;
  private armedAtMs = 0;
  private readonly presses = new Map<number, Press>();
  private groupErrors = 0;
  private _hint = false;
  private _stats: RunStats = emptyStats();
  private runStartMs = 0;
  private finished = false;
  /** Bewertung jeder aktuell gehaltenen Taste (für Feedback-Farben) */
  readonly keyJudgements = new Map<number, KeyJudgement>();
  private readonly listeners = new Set<(e: EngineEvent) => void>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(
    private readonly transport: Transport,
    private readonly clock: Clock,
    notes: readonly NoteEvent[],
    readonly config: WaitModeConfig,
    private readonly measures: readonly MeasureInfo[] = [],
  ) {
    this.groups = buildWaitGroups(notes, config, measures);
    let prev = transport.state;
    this.unsubscribe.push(
      transport.onStateChange((s) => {
        if (s === 'ended') this.finish();
        // Play nach Stopp/Ende = neuer Durchgang
        if (s === 'playing' && (prev === 'stopped' || prev === 'ended')) this.restart();
        prev = s;
      }),
      transport.onSeek((pos) => this.syncTo(pos)),
    );
    this.restart();
  }

  dispose(): void {
    for (const u of this.unsubscribe) u();
    this.transport.setHoldAt(null);
    this.listeners.clear();
  }

  on(l: (e: EngineEvent) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  get stats(): Readonly<RunStats> {
    return this._stats;
  }

  get currentGroup(): WaitGroup | null {
    const g = this.groups[this.current];
    return g && g.startSec < this.rangeEnd ? g : null;
  }

  get expectedKeys(): ReadonlyMap<number, Hand> | null {
    return this.currentGroup?.expected ?? null;
  }

  /** Wait-Modus braucht kein periodisches Update (Haltepunkt erledigt der Transport). */
  update(): void {}

  setRange(startSec: number, endSec: number | null): void {
    this.rangeStart = startSec;
    this.rangeEnd = endSec ?? Infinity;
    this.syncTo(Math.max(this.transport.position, startSec));
  }

  /** Loop-Durchlauf beendet: wieder an den Bereichsanfang. */
  completePass(): void {
    this.syncTo(this.rangeStart);
  }

  /** Gruppen im aktuellen Bereich */
  get groupsInRange(): number {
    return this.groups.filter((g) => g.startSec >= this.rangeStart - 1e-6 && g.startSec < this.rangeEnd)
      .length;
  }

  get currentGroupIndex(): number {
    return this.current;
  }

  /** Hinweisanzeige für die aktuelle Gruppe aktiv */
  get hint(): boolean {
    return this._hint;
  }

  /** Bereits angeschlagene erwartete Noten der aktuellen Gruppe (ohne Kopie, für Renderer pro Frame) */
  get satisfied(): { has(midi: number): boolean } {
    return this.presses;
  }

  isSatisfied(midi: number): boolean {
    return this.presses.has(midi);
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Neuer Durchgang ab der aktuellen Transportposition (Statistik zurückgesetzt). */
  restart(): void {
    this._stats = emptyStats();
    this.finished = false;
    this.runStartMs = this.clock.now();
    this.syncTo(this.transport.position);
  }

  /** Nach Seek: aktuelle Gruppe = erste Gruppe ab Position. Statistik bleibt. */
  syncTo(positionSec: number): void {
    const from = Math.max(positionSec, this.rangeStart);
    let idx = this.groups.findIndex((g) => g.startSec >= from - 1e-6);
    if (idx < 0) idx = this.groups.length;
    this.activate(idx);
  }

  handleInput(e: MidiInputEvent): void {
    if (e.type === 'noteoff') {
      this.keyJudgements.delete(e.midi);
      const p = this.presses.get(e.midi);
      if (p && p.offMs === null) p.offMs = e.timeMs;
      return;
    }
    if (e.type !== 'noteon') return;
    if (this.transport.state !== 'playing' || this.finished) return;

    const group = this.currentGroup;
    if (!group) return;
    const pos = this.transport.position;
    const inWindow = pos >= group.startSec - this.config.earlyWindowSec;

    if (inWindow && group.expected.has(e.midi)) {
      const isNew = !this.presses.has(e.midi);
      this.presses.set(e.midi, { onMs: e.timeMs, offMs: null });
      this.keyJudgements.set(e.midi, 'correct');
      if (isNew) recordCorrect(this._stats);
      this.emit({ type: 'correct', midi: e.midi, group: group.index });
      if (this.isGroupSatisfied(group, e.timeMs)) this.completeGroup(group, e.timeMs);
      return;
    }

    this.keyJudgements.set(e.midi, 'wrong');
    this.groupErrors++;
    recordError(this._stats, group.measure);
    this.emit({ type: 'wrong', midi: e.midi, group: group.index });
    if (!this._hint && this.config.hintAfterErrors > 0 && this.groupErrors >= this.config.hintAfterErrors) {
      this._hint = true;
      this.emit({ type: 'hint', group: group.index });
    }
  }

  private isGroupSatisfied(group: WaitGroup, nowMs: number): boolean {
    for (const midi of group.expected.keys()) {
      const p = this.presses.get(midi);
      if (!p || p.onMs < this.armedAtMs) return false;
      if (p.offMs !== null && nowMs - p.offMs > this.config.chordToleranceMs) return false;
    }
    return true;
  }

  private completeGroup(group: WaitGroup, nowMs: number): void {
    recordGroupComplete(this._stats, this.groupErrors > 0);
    this.emit({ type: 'group-complete', group: group.index, hadErrors: this.groupErrors > 0 });
    this.armedAtMs = nowMs;
    this.activate(group.index + 1, false);
  }

  private activate(index: number, resetArm = true): void {
    this.current = index;
    this.presses.clear();
    this.groupErrors = 0;
    this._hint = false;
    if (resetArm) this.armedAtMs = this.clock.now();
    const next = this.groups[index];
    this.transport.setHoldAt(next && next.startSec < this.rangeEnd ? next.startSec : null);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    const now = this.clock.now();
    this.emit({
      type: 'finished',
      result: buildResult(this._stats, {
        mode: 'wait',
        rate: this.transport.rate,
        hands: this.config.hands,
        totalGroups: this.groups.length,
        measureCount: this.measures.length,
        durationMs: now - this.runStartMs,
        finishedAt: Date.now(),
      }),
    });
  }

  private emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }
}
