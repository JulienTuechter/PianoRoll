import { describe, expect, it } from 'vitest';
import type { RunResult } from '../scoring/scoring';
import { dayKey, filterByMode, measureTrend, progressByDay, summarizeProgress } from './progress';

const day = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();

function run(
  accuracy: number,
  finishedAt: number,
  heatmap: number[] = [],
  over: Partial<RunResult> = {},
): RunResult {
  return {
    mode: 'wait',
    hands: 'both',
    rate: 1,
    finishedAt,
    durationMs: 60_000,
    accuracy,
    correctNotes: 10,
    wrongNotes: 0,
    extraNotes: 0,
    missedNotes: 0,
    totalGroups: 10,
    completedGroups: 10,
    complete: true,
    cleanGroups: 10,
    bestStreak: 10,
    heatmap,
    timing: null,
    ...over,
  };
}

describe('Lernverlauf', () => {
  it('gruppiert nach lokalem Tag, Bestwert nur aus vollständigen Durchgängen', () => {
    const runs = [
      run(0.9, day(3, 20)),
      run(0.6, day(1, 9)),
      run(0.8, day(1, 18)),
      run(1, day(3, 8), [], { complete: false }),
    ];
    const days = progressByDay(runs);
    expect(days.map((d) => d.day)).toEqual([dayKey(day(1)), dayKey(day(3))]);
    expect(days[0]).toMatchObject({ runs: 2, best: 0.8, practiceMs: 120_000 });
    expect(days[0]!.mean).toBeCloseTo(0.7);
    expect(days[1]).toMatchObject({ runs: 2, best: 0.9, lastAt: day(3, 20) });
  });

  it('Tag ohne vollständigen Durchgang hat keinen Bestwert', () => {
    expect(progressByDay([run(0.5, day(2), [], { complete: false })])[0]?.best).toBeNull();
  });

  it('fasst zusammen und vergleicht letzte mit früheren Durchgängen', () => {
    const runs = [0.5, 0.5, 0.6, 0.9, 0.9].map((a, i) => run(a, day(1 + i)));
    const s = summarizeProgress(runs, 2);
    expect(s).toMatchObject({ runs: 5, days: 5, best: 0.9, practiceMs: 300_000 });
    expect(s.recentMean).toBeCloseTo(0.9);
    expect(s.earlierMean).toBeCloseTo(0.55);
    expect(summarizeProgress(runs.slice(0, 2), 2).earlierMean).toBeNull();
  });

  it('Takt-Trend: Ø Fehler je Takt, letzte vs. frühere', () => {
    const runs = [
      run(0.5, day(1), [4, 2, 0]),
      run(0.5, day(2), [2, 2, 0]),
      run(0.9, day(3), [1, 0, 0]),
      run(0.9, day(4), [0, 0, 1]),
    ];
    const t = measureTrend(runs, 2)!;
    expect(t.recent).toEqual([0.5, 0, 0.5]);
    expect(t.earlier).toEqual([3, 2, 0]);
    expect(t.recentRuns).toBe(2);
    expect(measureTrend(runs.slice(0, 1), 2)?.earlier).toBeNull();
    expect(measureTrend([run(1, 1)], 2)).toBeNull();
  });

  it('filtert nach Modus', () => {
    const runs = [run(1, 1), run(1, 2, [], { mode: 'performance' })];
    expect(filterByMode(runs, 'performance')).toHaveLength(1);
    expect(filterByMode(runs, 'all')).toHaveLength(2);
  });
});
