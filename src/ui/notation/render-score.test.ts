import { describe, expect, it } from 'vitest';
import type { NotationEvent, NotationMeasure } from '../../core/notation-builder/notation';
import { cursorAt, lowerStaffClef, normalizePoints, xInRow } from './render-score';

describe('Cursor im Notenbild', () => {
  const points = normalizePoints([
    { tick: 0, x: 100, row: 0 },
    { tick: 0, x: 102, row: 0 }, // Bassschlüssel, gleicher Anschlag
    { tick: 480, x: 200, row: 0 },
    { tick: 960, x: 300, row: 0 }, // Zeilenende (Taktstrich)
    { tick: 960, x: 120, row: 1 }, // Anfang nächste Zeile
    { tick: 1440, x: 220, row: 1 },
  ]);

  it('fasst gleiche Anschläge zusammen, behält aber Zeilenumbrüche', () => {
    expect(points.map((p) => [p.tick, p.row])).toEqual([
      [0, 0],
      [480, 0],
      [960, 0],
      [960, 1],
      [1440, 1],
    ]);
  });

  it('interpoliert zwischen Anschlägen', () => {
    expect(cursorAt(points, 240)).toEqual({ x: 150, row: 0 });
  });

  it('läuft bis zum Zeilenende und springt dann in die nächste Zeile', () => {
    expect(cursorAt(points, 900)?.row).toBe(0);
    expect(cursorAt(points, 900)!.x).toBeCloseTo(287.5);
    expect(cursorAt(points, 960)).toEqual({ x: 120, row: 1 });
    expect(cursorAt(points, 1200)).toEqual({ x: 170, row: 1 });
  });

  it('klemmt vor dem Anfang und nach dem Ende', () => {
    expect(cursorAt(points, -100)).toEqual({ x: 100, row: 0 });
    expect(cursorAt(points, 99999)).toEqual({ x: 220, row: 1 });
    expect(cursorAt([], 0)).toBeNull();
  });
});

describe('Zeichen und Schlüssel', () => {
  const points = [
    { tick: 0, x: 100, row: 0 },
    { tick: 480, x: 200, row: 0 },
    { tick: 960, x: 300, row: 0 },
    { tick: 960, x: 120, row: 1 },
  ];
  it('interpoliert x innerhalb einer Zeile', () => {
    expect(xInRow(points, 0, 240)).toBe(150);
    expect(xInRow(points, 0, 960)).toBe(300);
    expect(xInRow(points, 1, 960)).toBe(120);
    expect(xInRow(points, 2, 0)).toBeNull();
  });

  const ev = (midis: number[]): NotationEvent => ({
    startTick: 0,
    durationTicks: 480,
    rest: midis.length === 0,
    keys: [],
    midis,
    value: '4',
    dots: 0,
    wholeMeasureRest: false,
    tieNext: false,
    tuplet: null,
    noteIds: [],
  });
  const measure = (bass: number[][]): NotationMeasure => ({
    index: 0,
    startTick: 0,
    endTick: 1920,
    numerator: 4,
    denominator: 4,
    timeSigChange: false,
    treble: [],
    bass: bass.map(ev),
    treble2: [],
    bass2: [],
    chords: [],
    dynamic: null,
  });
  it('setzt die linke Hand in hoher Lage in den Violinschlüssel', () => {
    expect(lowerStaffClef([measure([[60, 64], [62], [65]])])).toBe('treble');
    expect(lowerStaffClef([measure([[48], [60], [64]])])).toBe('bass');
    expect(lowerStaffClef([measure([[]])])).toBe('bass');
  });
});
