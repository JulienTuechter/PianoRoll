import { describe, expect, it } from 'vitest';
import { buildMeasures, TempoMap } from '../note-event-model/tempo-map';
import { beatSecAt, buildBeatGrid, buildCountIn, countInRemaining } from './beats';
import { defaultLoopAt, loopBounds, LoopTrainer, normalizeLoop } from './loop';

const ppq = 480;
const tempo = new TempoMap(ppq, [{ tick: 0, bpm: 120 }]);
const measures = buildMeasures(
  ppq,
  [
    { tick: 0, numerator: 4, denominator: 4 },
    { tick: 1920 * 2, numerator: 6, denominator: 8 },
  ],
  tempo,
  1920 * 2 + 1440 * 2 - 1,
);

describe('Beat-Raster', () => {
  it('erzeugt Schläge mit Betonung und Taktartwechsel', () => {
    const beats = buildBeatGrid(measures, ppq, tempo);
    expect(beats.slice(0, 5).map((b) => [b.startSec, b.accent])).toEqual([
      [0, true],
      [0.5, false],
      [1, false],
      [1.5, false],
      [2, true],
    ]);
    // 6/8: Achtel-Schläge à 0,25 s ab Sekunde 4
    const m2 = beats.filter((b) => b.measure === 2);
    expect(m2).toHaveLength(6);
    expect(m2[1]!.startSec - m2[0]!.startSec).toBeCloseTo(0.25);
  });

  it('berechnet die Schlagdauer', () => {
    expect(beatSecAt(measures[0]!, ppq, tempo)).toBeCloseTo(0.5);
    expect(beatSecAt(measures[2]!, ppq, tempo)).toBeCloseTo(0.25);
  });
});

describe('Count-in', () => {
  it('legt die Schläge vor den Startpunkt', () => {
    const ci = buildCountIn(4, 1, 4, 0.5)!;
    expect(ci.prerollSec).toBe(2);
    expect(ci.beats.map((b) => b.startSec)).toEqual([2, 2.5, 3, 3.5]);
    expect(ci.beats[0]?.accent).toBe(true);
    expect(buildCountIn(4, 0, 4, 0.5)).toBeNull();
  });

  it('zählt rückwärts', () => {
    const ci = buildCountIn(0, 1, 4, 0.5)!;
    expect(countInRemaining(ci, -2)).toBe(4);
    expect(countInRemaining(ci, -1.9)).toBe(4);
    expect(countInRemaining(ci, -0.4)).toBe(1);
    expect(countInRemaining(ci, 0)).toBe(0);
  });
});

describe('Loop', () => {
  it('normalisiert und berechnet Grenzen', () => {
    expect(normalizeLoop({ startMeasure: 3, endMeasure: 1 }, 4)).toEqual({ startMeasure: 1, endMeasure: 3 });
    expect(loopBounds({ startMeasure: 0, endMeasure: 1 }, measures, 99)).toEqual({ startSec: 0, endSec: 4 });
    // letzter Takt → Songende
    expect(loopBounds({ startMeasure: 3, endMeasure: 3 }, measures, 7.5)).toEqual({
      startSec: 5.5,
      endSec: 7.5,
    });
    expect(defaultLoopAt(2, 4)).toEqual({ startMeasure: 2, endMeasure: 3 });
    expect(normalizeLoop({ startMeasure: 0, endMeasure: 0 }, 0)).toBeNull();
  });
});

describe('LoopTrainer (Auto-Tempo)', () => {
  const cfg = { enabled: true, cleanPasses: 2, stepPercent: 5, maxRate: 1 };

  it('steigert nach X sauberen Durchläufen in Folge', () => {
    const t = new LoopTrainer(cfg);
    expect(t.passCompleted(true, 0.7).newRate).toBeNull();
    expect(t.passCompleted(true, 0.7).newRate).toBeCloseTo(0.75);
    expect(t.cleanStreak).toBe(0);
  });

  it('setzt die Serie bei Fehlern zurück', () => {
    const t = new LoopTrainer(cfg);
    t.passCompleted(true, 0.7);
    t.passCompleted(false, 0.7);
    expect(t.passCompleted(true, 0.7).newRate).toBeNull();
  });

  it('respektiert Obergrenze und Abschaltung', () => {
    const t = new LoopTrainer(cfg);
    t.passCompleted(true, 0.98);
    expect(t.passCompleted(true, 0.98).newRate).toBe(1);
    t.passCompleted(true, 1);
    expect(t.passCompleted(true, 1).newRate).toBeNull();
    const off = new LoopTrainer({ ...cfg, enabled: false });
    off.passCompleted(true, 0.5);
    expect(off.passCompleted(true, 0.5).newRate).toBeNull();
  });
});
