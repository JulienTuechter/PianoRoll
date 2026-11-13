import { describe, expect, it } from 'vitest';
import { firstNoteIndexAtOrAfter, groupByOnset, isBlackKey, midiToName } from './notes';
import { TempoMap, buildMeasures } from './tempo-map';
import type { NoteEvent } from './types';

function n(midi: number, startSec: number, durationSec = 0.5): NoteEvent {
  return {
    id: `${midi}@${startSec}`,
    midi,
    startTick: 0,
    startSec,
    durationSec,
    velocity: 0.8,
    hand: 'right',
    track: 0,
  };
}

describe('Notenhelfer', () => {
  it('erkennt schwarze Tasten und Namen', () => {
    expect(isBlackKey(61)).toBe(true);
    expect(isBlackKey(60)).toBe(false);
    expect(midiToName(60)).toBe('C4');
    expect(midiToName(21)).toBe('A0');
    expect(midiToName(108)).toBe('C8');
  });

  it('gruppiert Noten innerhalb 40 ms ab dem ersten Ton', () => {
    const groups = groupByOnset([n(60, 0), n(64, 0.02), n(67, 0.04), n(72, 0.07), n(48, 1)]);
    expect(groups.map((g) => g.map((x) => x.midi))).toEqual([[60, 64, 67], [72], [48]]);
  });

  it('verkettet kein Arpeggio zu einer Gruppe', () => {
    const groups = groupByOnset([n(60, 0), n(62, 0.03), n(64, 0.06), n(65, 0.09)]);
    expect(groups).toHaveLength(2);
  });

  it('findet per binärer Suche die erste Note ab Zeitpunkt', () => {
    const notes = [n(60, 0), n(62, 1), n(64, 2), n(65, 3)];
    expect(firstNoteIndexAtOrAfter(notes, 1.5)).toBe(2);
    expect(firstNoteIndexAtOrAfter(notes, 0)).toBe(0);
    expect(firstNoteIndexAtOrAfter(notes, 10)).toBe(4);
  });
});

describe('TempoMap', () => {
  it('rechnet mit konstantem Tempo', () => {
    const m = new TempoMap(480, [{ tick: 0, bpm: 120 }]);
    expect(m.tickToSec(480)).toBeCloseTo(0.5);
    expect(m.secToTick(1)).toBeCloseTo(960);
  });

  it('nimmt 120 BPM an, wenn keine Tempi vorhanden sind', () => {
    const m = new TempoMap(96, []);
    expect(m.tickToSec(96)).toBeCloseTo(0.5);
  });

  it('rechnet über Tempowechsel', () => {
    const m = new TempoMap(480, [
      { tick: 0, bpm: 120 },
      { tick: 960, bpm: 60 },
    ]);
    expect(m.tickToSec(960)).toBeCloseTo(1);
    expect(m.tickToSec(1440)).toBeCloseTo(2);
    expect(m.secToTick(2)).toBeCloseTo(1440);
    expect(m.bpmAtTick(1000)).toBe(60);
  });

  it('baut Takte mit Taktartwechsel', () => {
    const m = new TempoMap(480, [{ tick: 0, bpm: 120 }]);
    const measures = buildMeasures(
      480,
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 4 },
      ],
      m,
      1920 + 1440 * 2,
    );
    expect(measures.map((x) => x.startTick)).toEqual([0, 1920, 3360, 4800]);
    expect(measures[1]).toMatchObject({ numerator: 3, startSec: 2 });
  });
});

describe('measureIndexAt', () => {
  it('findet den Takt zu einer Zeit', async () => {
    const { measureIndexAt } = await import('./tempo-map');
    const ms = [0, 2, 4, 6].map((startSec, index) => ({
      index,
      startSec,
      startTick: 0,
      numerator: 4,
      denominator: 4,
    }));
    expect(measureIndexAt(ms, 0)).toBe(0);
    expect(measureIndexAt(ms, 3.9)).toBe(1);
    expect(measureIndexAt(ms, 4)).toBe(2);
    expect(measureIndexAt(ms, 99)).toBe(3);
    expect(measureIndexAt([], 1)).toBe(0);
  });
});
