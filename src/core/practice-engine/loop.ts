import type { MeasureInfo } from '../note-event-model/tempo-map';

/** Loop über Takte [startMeasure, endMeasure] (beide inklusive, 0-basiert). */
export interface LoopRange {
  startMeasure: number;
  endMeasure: number;
}

export interface LoopBounds {
  startSec: number;
  endSec: number;
}

export function normalizeLoop(range: LoopRange, measureCount: number): LoopRange | null {
  if (measureCount <= 0) return null;
  const a = Math.max(0, Math.min(measureCount - 1, Math.min(range.startMeasure, range.endMeasure)));
  const b = Math.max(0, Math.min(measureCount - 1, Math.max(range.startMeasure, range.endMeasure)));
  return { startMeasure: a, endMeasure: b };
}

/** Zeitgrenzen eines Loops. Das Ende ist der Beginn des Folgetakts (bzw. Songende). */
export function loopBounds(
  range: LoopRange,
  measures: readonly MeasureInfo[],
  songEndSec: number,
): LoopBounds | null {
  const r = normalizeLoop(range, measures.length);
  if (!r) return null;
  const start = measures[r.startMeasure];
  if (!start) return null;
  const endSec = measures[r.endMeasure + 1]?.startSec ?? songEndSec;
  if (endSec <= start.startSec) return null;
  return { startSec: start.startSec, endSec };
}

/** Standard-Loop beim Drücken von L ohne Auswahl: aktueller Takt + (len-1) folgende. */
export function defaultLoopAt(measure: number, measureCount: number, length = 4): LoopRange | null {
  return normalizeLoop({ startMeasure: measure, endMeasure: measure + length - 1 }, measureCount);
}

export interface AutoTempoConfig {
  enabled: boolean;
  /** Saubere Durchläufe in Folge bis zur Steigerung */
  cleanPasses: number;
  /** Steigerung in Prozentpunkten (bezogen auf 100 % Originaltempo) */
  stepPercent: number;
  /** Obergrenze als Rate (1 = 100 %) */
  maxRate: number;
}

export interface PassOutcome {
  /** Neue Rate, falls gesteigert wurde */
  newRate: number | null;
  cleanStreak: number;
}

/** Auto-Tempo-Training: nach X sauberen Durchläufen in Folge steigt das Tempo um Y %. */
export class LoopTrainer {
  private streak = 0;
  passes = 0;

  constructor(private config: AutoTempoConfig) {}

  setConfig(config: AutoTempoConfig): void {
    this.config = config;
  }

  get cleanStreak(): number {
    return this.streak;
  }

  reset(): void {
    this.streak = 0;
    this.passes = 0;
  }

  passCompleted(clean: boolean, currentRate: number): PassOutcome {
    this.passes++;
    this.streak = clean ? this.streak + 1 : 0;
    const c = this.config;
    if (!c.enabled || this.streak < c.cleanPasses || currentRate >= c.maxRate - 1e-9) {
      return { newRate: null, cleanStreak: this.streak };
    }
    this.streak = 0;
    const next = Math.min(c.maxRate, Math.round((currentRate + c.stepPercent / 100) * 100) / 100);
    return { newRate: next, cleanStreak: 0 };
  }
}
