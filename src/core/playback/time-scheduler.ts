export interface Timed {
  startSec: number;
}

export interface Scheduled<T> {
  item: T;
  /** Sekunden ab jetzt (Echtzeit, bereits durch die Rate geteilt), ≥ 0 */
  delaySec: number;
}

function firstIndexAtOrAfter(items: readonly Timed[], sec: number): number {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((items[mid]?.startSec ?? Infinity) < sec) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Plant zeitlich sortierte Ereignisse (Noten, Metronom-Klicks) mit Vorlauf, damit die Audio-Ausgabe
 * sample-genau statt frame-genau ist. Wird regelmäßig mit der aktuellen Songposition aufgerufen.
 */
export class TimeScheduler<T extends Timed> {
  private nextIndex = 0;
  private scheduledUntil = 0;

  constructor(
    private items: readonly T[],
    private readonly lookaheadSec = 0.12,
  ) {}

  setItems(items: readonly T[], positionSec: number): void {
    this.items = items;
    this.reset(positionSec);
  }

  /** Nach Seek / Pause: ab dieser Position neu planen. */
  reset(positionSec: number): void {
    this.nextIndex = firstIndexAtOrAfter(this.items, positionSec);
    this.scheduledUntil = positionSec;
  }

  /**
   * @param limitSec Ereignisse ab diesem Zeitpunkt werden (noch) nicht geplant – z. B. der Haltepunkt im Wait-Modus.
   */
  tick(positionSec: number, rate: number, limitSec = Infinity): Scheduled<T>[] {
    const horizon = Math.min(positionSec + this.lookaheadSec * rate, limitSec);
    if (horizon <= this.scheduledUntil) return [];
    const out: Scheduled<T>[] = [];
    while (this.nextIndex < this.items.length) {
      const it = this.items[this.nextIndex]!;
      if (it.startSec >= horizon) break;
      this.nextIndex++;
      if (it.startSec < this.scheduledUntil - 1e-9) continue;
      out.push({ item: it, delaySec: Math.max(0, (it.startSec - positionSec) / rate) });
    }
    this.scheduledUntil = horizon;
    return out;
  }
}
