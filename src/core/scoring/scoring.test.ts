import { describe, expect, it } from 'vitest';
import {
  accuracy,
  buildResult,
  emptyStats,
  recordError,
  recordGroupComplete,
  worstMeasures,
} from './scoring';

describe('Scoring', () => {
  it('berechnet Genauigkeit', () => {
    expect(accuracy({ correctNotes: 0, wrongNotes: 0 })).toBe(1);
    expect(accuracy({ correctNotes: 9, wrongNotes: 1 })).toBeCloseTo(0.9);
  });

  it('führt Serie und beste Serie', () => {
    const s = emptyStats();
    recordGroupComplete(s, false);
    recordGroupComplete(s, false);
    recordError(s, 3);
    recordGroupComplete(s, true);
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(s.cleanGroups).toBe(2);
  });

  it('baut Heatmap und Problemstellen', () => {
    const s = emptyStats();
    recordError(s, 1);
    recordError(s, 1);
    recordError(s, 3);
    recordError(s, 99); // außerhalb → ignoriert
    const r = buildResult(s, {
      hands: 'both',
      totalGroups: 5,
      measureCount: 4,
      durationMs: 1,
      finishedAt: 0,
    });
    expect(r.heatmap).toEqual([0, 2, 0, 1]);
    expect(worstMeasures(r.heatmap)).toEqual([
      { measure: 1, errors: 2 },
      { measure: 3, errors: 1 },
    ]);
  });
});

describe('Timing', () => {
  it('bewertet Abweichungen nach Fenstern', async () => {
    const { gradeOffset, defaultTimingWindows: w } = await import('./scoring');
    expect(gradeOffset(0, w)).toEqual({ grade: 'perfect', direction: 'onTime' });
    expect(gradeOffset(-50, w)).toEqual({ grade: 'perfect', direction: 'onTime' });
    expect(gradeOffset(-80, w)).toEqual({ grade: 'good', direction: 'early' });
    expect(gradeOffset(120, w)).toEqual({ grade: 'good', direction: 'late' });
    expect(gradeOffset(121, w)).toEqual({ grade: 'miss', direction: 'late' });
  });

  it('zählt Treffer, Verteilung und Punkte', async () => {
    const { recordHit, recordMissed, summarizeTiming, defaultTimingWindows: w } = await import('./scoring');
    const s = emptyStats();
    recordHit(s, 10, w, 0);
    recordHit(s, -90, w, 0);
    recordHit(s, 200, w, 1);
    recordMissed(s, 2);
    expect(s.correctNotes).toBe(2);
    expect(s.missedNotes).toBe(2);
    expect(accuracy(s)).toBeCloseTo(0.5);
    const t = summarizeTiming(s, 4, w);
    expect(t).toMatchObject({ perfect: 1, good: 1, missHits: 1, missed: 1, early: 1, onTime: 1, late: 1 });
    expect(t.points).toBeCloseTo((1 + 0.6) / 4);
    expect(t.histogram.counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.errorsByMeasure.get(1)).toBe(1);
  });

  it('baut ein Histogramm mit Randklemmung', async () => {
    const { buildHistogram } = await import('./scoring');
    const h = buildHistogram([-300, -1, 0, 99, 400], 100, 50);
    expect(h.counts).toEqual([1, 1, 1, 2]);
  });
});

describe('Loop-Durchlauf', () => {
  it('berechnet die Bilanz eines Durchlaufs', async () => {
    const { passSummary } = await import('./scoring');
    const before = { correct: 10, wrong: 1, extra: 0, missed: 0 };
    expect(passSummary(before, { correct: 15, wrong: 1, extra: 0, missed: 0 })).toMatchObject({
      correct: 5,
      clean: true,
      accuracy: 1,
    });
    expect(passSummary(before, { correct: 15, wrong: 1, extra: 1, missed: 0 }).clean).toBe(false);
    expect(passSummary(before, before).clean).toBe(false);
  });
});
