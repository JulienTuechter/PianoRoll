import { describe, expect, it } from 'vitest';
import {
  analyzeTaps,
  clickTimes,
  LATENCY_MAX_MS,
  measuredClicks,
  median,
  planEndMs,
  suggestLatency,
  type CalibrationPlan,
} from './calibration';

const plan: CalibrationPlan = { startMs: 1000, beatMs: 600, countIn: 4, measured: 16 };

describe('Latenz-Messtest', () => {
  it('plant Einzählen und Messklicks im festen Abstand', () => {
    expect(clickTimes(plan)).toHaveLength(20);
    expect(measuredClicks(plan)[0]).toBe(1000 + 4 * 600);
    expect(planEndMs(plan)).toBe(1000 + 19.5 * 600);
  });

  it('findet einen gleichmäßigen Versatz', () => {
    const clicks = measuredClicks(plan);
    const taps = clicks.map((c, i) => c + 42 + (i % 2 ? 3 : -3));
    const r = analyzeTaps(clicks, taps, plan.beatMs)!;
    expect(r.offsetMs).toBeGreaterThanOrEqual(39);
    expect(r.offsetMs).toBeLessThanOrEqual(45);
    expect(r.suggestedMs).toBe(40);
    expect(r.used).toBe(16);
    expect(r.unreliable).toBe(false);
  });

  it('ignoriert Ausreißer, verpasste Schläge und Doppelanschläge', () => {
    const clicks = measuredClicks(plan);
    const taps: number[] = [];
    clicks.forEach((c, i) => {
      if (i === 3) return; // verpasst
      taps.push(c + 60);
      if (i === 5) taps.push(c + 261); // zweiter Anschlag: weiter weg als der erste, zählt nicht
    });
    taps.push(clicks[8]! - 250); // Ausreißer zu früh (innerhalb des Fensters)
    const r = analyzeTaps(clicks, taps, plan.beatMs)!;
    expect(r.offsetMs).toBe(60);
    expect(r.used).toBe(15);
  });

  it('liefert null bei zu wenigen Anschlägen', () => {
    const clicks = measuredClicks(plan);
    expect(analyzeTaps(clicks, clicks.slice(0, 4), plan.beatMs)).toBeNull();
    expect(analyzeTaps(clicks, [], plan.beatMs)).toBeNull();
  });

  it('markiert stark streuende Messungen als ungenau', () => {
    const clicks = measuredClicks(plan);
    const jitter = [0, 120, -90, 60, -120, 100, -60, 140, -130, 30, 90, -100, 10, 110, -80, 50];
    const r = analyzeTaps(
      clicks,
      clicks.map((c, i) => c + 50 + jitter[i]!),
      plan.beatMs,
    )!;
    expect(r.unreliable).toBe(true);
  });

  it('rundet den Vorschlag und begrenzt ihn', () => {
    expect(suggestLatency(-30)).toBe(0);
    expect(suggestLatency(37)).toBe(35);
    expect(suggestLatency(38)).toBe(40);
    expect(suggestLatency(900)).toBe(LATENCY_MAX_MS);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
