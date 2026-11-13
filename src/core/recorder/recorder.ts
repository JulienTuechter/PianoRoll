import type { MidiInputEvent } from '../midi-input/types';

/** Eine aufgenommene Note, Zeiten in ms relativ zum Aufnahmestart (nach dem Count-in). */
export interface RawNote {
  midi: number;
  startMs: number;
  endMs: number;
  /** 0..1 */
  velocity: number;
}

export interface Recording {
  /** Viertel pro Minute */
  bpm: number;
  numerator: number;
  denominator: number;
  /** Wanduhr-Zeit des Starts (für Titel/Bibliothek) */
  startedAt: number;
  durationMs: number;
  notes: RawNote[];
  pedal: { timeMs: number; down: boolean }[];
}

/**
 * Zeichnet Input-Events relativ zu `t0Ms` auf (performance.now-Zeitbasis wie die MIDI-Zeitstempel).
 * Noten, die beim Stopp noch klingen, werden dort beendet.
 */
export class Recorder {
  private readonly notes: RawNote[] = [];
  private readonly open = new Map<number, RawNote>();
  private readonly pedal: { timeMs: number; down: boolean }[] = [];

  constructor(
    private readonly t0Ms: number,
    readonly bpm: number,
    readonly numerator: number,
    readonly denominator: number,
    private readonly startedAt: number = Date.now(),
  ) {}

  get noteCount(): number {
    return this.notes.length;
  }

  handle(e: MidiInputEvent): void {
    const t = e.timeMs - this.t0Ms;
    switch (e.type) {
      case 'noteon': {
        this.close(e.midi, t);
        const n: RawNote = { midi: e.midi, startMs: t, endMs: t, velocity: e.velocity };
        this.notes.push(n);
        this.open.set(e.midi, n);
        break;
      }
      case 'noteoff':
        this.close(e.midi, t);
        break;
      case 'sustain':
        this.pedal.push({ timeMs: t, down: e.down });
        break;
    }
  }

  private close(midi: number, t: number): void {
    const n = this.open.get(midi);
    if (!n) return;
    n.endMs = Math.max(t, n.startMs + 1);
    this.open.delete(midi);
  }

  stop(nowMs: number): Recording {
    const t = nowMs - this.t0Ms;
    for (const midi of [...this.open.keys()]) this.close(midi, t);
    return {
      bpm: this.bpm,
      numerator: this.numerator,
      denominator: this.denominator,
      startedAt: this.startedAt,
      durationMs: Math.max(0, t),
      notes: [...this.notes].sort((a, b) => a.startMs - b.startMs || a.midi - b.midi),
      pedal: [...this.pedal],
    };
  }
}
