import type { TempoChange, TimeSignatureChange } from './types';

/** Rechnet Ticks ↔ Sekunden über eine Tempo-Map. */
export class TempoMap {
  private readonly tempos: TempoChange[];

  constructor(
    readonly ppq: number,
    tempos: readonly { tick: number; bpm: number }[],
  ) {
    const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
    if (sorted.length === 0 || (sorted[0]?.tick ?? 0) > 0) sorted.unshift({ tick: 0, bpm: 120 });
    const out: TempoChange[] = [];
    let sec = 0;
    let prev: TempoChange | undefined;
    for (const t of sorted) {
      if (prev) sec += ((t.tick - prev.tick) / ppq) * (60 / prev.bpm);
      const entry = { tick: t.tick, bpm: t.bpm, sec };
      // Gleicher Tick → letzter gewinnt
      if (prev && prev.tick === t.tick) out[out.length - 1] = entry;
      else out.push(entry);
      prev = entry;
    }
    this.tempos = out;
  }

  get changes(): readonly TempoChange[] {
    return this.tempos;
  }

  tickToSec(tick: number): number {
    const t = this.findByTick(tick);
    return t.sec + ((tick - t.tick) / this.ppq) * (60 / t.bpm);
  }

  secToTick(sec: number): number {
    let t = this.tempos[0]!;
    for (const c of this.tempos) {
      if (c.sec <= sec) t = c;
      else break;
    }
    return t.tick + ((sec - t.sec) * t.bpm * this.ppq) / 60;
  }

  bpmAtTick(tick: number): number {
    return this.findByTick(tick).bpm;
  }

  private findByTick(tick: number): TempoChange {
    let t = this.tempos[0]!;
    for (const c of this.tempos) {
      if (c.tick <= tick) t = c;
      else break;
    }
    return t;
  }
}

export interface MeasureInfo {
  index: number;
  startTick: number;
  startSec: number;
  numerator: number;
  denominator: number;
}

/** Erzeugt die Takte (mit Startzeit) bis `endTick` aus Taktartwechseln. */
export function buildMeasures(
  ppq: number,
  timeSigs: readonly Omit<TimeSignatureChange, 'measure'>[],
  tempoMap: TempoMap,
  endTick: number,
): MeasureInfo[] {
  const sigs = [...timeSigs].sort((a, b) => a.tick - b.tick);
  if (sigs.length === 0 || (sigs[0]?.tick ?? 0) > 0) sigs.unshift({ tick: 0, numerator: 4, denominator: 4 });
  const measures: MeasureInfo[] = [];
  let tick = 0;
  let sigIdx = 0;
  // Sicherheitslimit gegen Endlosschleifen bei kaputten Dateien
  while (tick <= endTick && measures.length < 100_000) {
    while (sigIdx + 1 < sigs.length && (sigs[sigIdx + 1]?.tick ?? Infinity) <= tick) sigIdx++;
    const sig = sigs[sigIdx]!;
    const len = Math.max(1, Math.round(ppq * sig.numerator * (4 / sig.denominator)));
    measures.push({
      index: measures.length,
      startTick: tick,
      startSec: tempoMap.tickToSec(tick),
      numerator: sig.numerator,
      denominator: sig.denominator,
    });
    tick += len;
  }
  return measures;
}

/** Index des Takts, in dem `sec` liegt (binäre Suche). Vor dem ersten Takt → 0. */
export function measureIndexAt(measures: readonly MeasureInfo[], sec: number): number {
  let lo = 0;
  let hi = measures.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if ((measures[mid]?.startSec ?? Infinity) <= sec + 1e-9) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return measures[found]?.index ?? 0;
}
