import type { MeasureInfo, TempoMap } from '../note-event-model/tempo-map';

export interface Beat {
  startSec: number;
  measure: number;
  /** Schlag im Takt, 0-basiert */
  beat: number;
  /** Erster Schlag des Takts */
  accent: boolean;
  /** Gehört zum Einzählen (nicht zum Stück) */
  countIn?: boolean;
}

/** Ticks pro Schlag (Nenner der Taktart: 4 → Viertel, 8 → Achtel). */
export function beatTicks(ppq: number, denominator: number): number {
  return (ppq * 4) / denominator;
}

/** Alle Metronom-Schläge des Stücks entlang der Takte (inkl. Tempo- und Taktartwechseln). */
export function buildBeatGrid(measures: readonly MeasureInfo[], ppq: number, tempoMap: TempoMap): Beat[] {
  const beats: Beat[] = [];
  for (const m of measures) {
    const step = beatTicks(ppq, m.denominator);
    for (let b = 0; b < m.numerator; b++) {
      beats.push({
        startSec: tempoMap.tickToSec(m.startTick + b * step),
        measure: m.index,
        beat: b,
        accent: b === 0,
      });
    }
  }
  return beats;
}

/** Dauer eines Schlags in Songsekunden am gegebenen Takt. */
export function beatSecAt(measure: MeasureInfo, ppq: number, tempoMap: TempoMap): number {
  const bpm = tempoMap.bpmAtTick(measure.startTick);
  return (60 / bpm) * (beatTicks(ppq, measure.denominator) / ppq);
}

export interface CountIn {
  /** Zielpunkt (hier beginnt das Stück bzw. der Loop) */
  startSec: number;
  /** Vorlauf in Songsekunden */
  prerollSec: number;
  beatSec: number;
  beats: Beat[];
}

/** Einzähl-Schläge vor `startSec`: `bars` Takte mit `numerator` Schlägen. */
export function buildCountIn(
  startSec: number,
  bars: number,
  numerator: number,
  beatSec: number,
): CountIn | null {
  if (bars <= 0 || numerator <= 0 || beatSec <= 0) return null;
  const total = bars * numerator;
  const beats: Beat[] = [];
  for (let i = 0; i < total; i++) {
    const beat = i % numerator;
    beats.push({
      startSec: startSec - (total - i) * beatSec,
      measure: -1,
      beat,
      accent: beat === 0,
      countIn: true,
    });
  }
  return { startSec, prerollSec: total * beatSec, beatSec, beats };
}

/** Wie viele Einzählschläge bleiben noch (für die große Anzeige 4-3-2-1)? 0 = vorbei. */
export function countInRemaining(ci: CountIn, positionSec: number): number {
  if (positionSec >= ci.startSec) return 0;
  return Math.max(1, Math.ceil((ci.startSec - positionSec) / ci.beatSec - 1e-6));
}
