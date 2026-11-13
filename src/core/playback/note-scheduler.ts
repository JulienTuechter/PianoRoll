import type { NoteEvent } from '../note-event-model/types';
import { TimeScheduler } from './time-scheduler';

export interface ScheduledNote {
  note: NoteEvent;
  /** Sekunden ab jetzt (Echtzeit, bereits durch die Rate geteilt), ≥ 0 */
  delaySec: number;
  /** Klingdauer in Echtzeit-Sekunden */
  durationSec: number;
}

/** Noten-Variante des TimeSchedulers (liefert zusätzlich die Klingdauer in Echtzeit). */
export class NoteScheduler {
  private readonly inner: TimeScheduler<NoteEvent>;

  constructor(notes: readonly NoteEvent[], lookaheadSec = 0.12) {
    this.inner = new TimeScheduler(notes, lookaheadSec);
  }

  setNotes(notes: readonly NoteEvent[], positionSec: number): void {
    this.inner.setItems(notes, positionSec);
  }

  reset(positionSec: number): void {
    this.inner.reset(positionSec);
  }

  tick(positionSec: number, rate: number, limitSec = Infinity): ScheduledNote[] {
    return this.inner
      .tick(positionSec, rate, limitSec)
      .map((s) => ({ note: s.item, delaySec: s.delaySec, durationSec: s.item.durationSec / rate }));
  }
}
