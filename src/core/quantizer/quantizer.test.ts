import { describe, expect, it } from 'vitest';
import { buildMeasures, TempoMap } from '../note-event-model/tempo-map';
import { buildNotation } from '../notation-builder/notation';
import { Recorder, type RawNote, type Recording } from '../recorder/recorder';
import { quantize, unswing, type QuantizeOptions } from './quantizer';

/** 100 BPM: Viertel = 600 ms, 480 Ticks */
const BEAT = 600;
const rec = (notes: RawNote[], extra: Partial<Recording> = {}): Recording => ({
  bpm: 100,
  numerator: 4,
  denominator: 4,
  startedAt: 0,
  durationMs: 10_000,
  notes,
  pedal: [],
  ...extra,
});
const note = (midi: number, startMs: number, lenMs: number, velocity = 0.7): RawNote => ({
  midi,
  startMs,
  endMs: startMs + lenMs,
  velocity,
});
/** Deterministische „Ungenauigkeit“ ±maxMs */
const jitter = (i: number, maxMs: number) => Math.round(Math.sin(i * 12.9898) * maxMs);
const q = (r: Recording, o: Partial<QuantizeOptions> = {}) =>
  quantize(r, { splitPoint: 0, ...o }).notes.map((n) => [n.startTick, n.durationTicks]);

describe('Quantizer – ungenaues Spiel', () => {
  it('legt wackelige Viertel exakt auf die Schläge', () => {
    const notes = [60, 62, 64, 65, 67, 65, 64, 62].map((m, i) =>
      note(m, i * BEAT + jitter(i, 35), 540 + jitter(i + 3, 40)),
    );
    expect(q(rec(notes))).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [i * 480, 480]));
  });

  it('fasst leicht verzögert angeschlagene Akkorde zusammen', () => {
    const notes = [note(60, 5, 1150), note(64, 28, 1130), note(67, -12, 1180)];
    const r = quantize(rec(notes), { splitPoint: 0 });
    expect(r.notes.map((n) => n.startTick)).toEqual([0, 0, 0]);
    expect(r.notes.every((n) => n.durationTicks === 960)).toBe(true);
  });

  it('nimmt eine kurz vor dem Taktstrich gespielte Note in den neuen Takt', () => {
    const notes = [note(60, 4 * BEAT - 25, 500)];
    expect(q(rec(notes))[0]![0]).toBe(1920);
  });

  it('verwirft Noten deutlich vor dem Start, behält leicht vorgezogene', () => {
    const notes = [note(55, -500, 200), note(60, -30, 560)];
    expect(q(rec(notes))).toEqual([[0, 480]]);
  });

  it('erzwingt die Mindestnotenlänge bei Staccato', () => {
    const notes = [note(60, 0, 60), note(62, BEAT, 70)];
    expect(q(rec(notes), { minNote: 16 }).map((x) => x[1])).toEqual([120, 120]);
    expect(q(rec(notes), { minNote: 8 }).map((x) => x[1])).toEqual([240, 240]);
  });

  it('kürzt Legato-Überhänge am nächsten Anschlag', () => {
    // Achtel, jede hält 80 ms in die nächste hinein
    const notes = [0, 1, 2, 3].map((i) => note(60 + i, i * 300, 380));
    // letzte Note hat keinen Nachfolger → bleibt so lang wie gespielt (punktierte Achtel)
    expect(q(rec(notes), { resolveOverlaps: true }).map((x) => x[1])).toEqual([240, 240, 240, 360]);
    expect(q(rec(notes), { resolveOverlaps: false }).map((x) => x[1])).toEqual([360, 360, 360, 360]);
  });

  it('lässt einen bewusst gehaltenen Basston unter einer Melodie stehen', () => {
    const notes = [note(48, 0, 2350), note(64, 0, 560), note(65, BEAT, 560), note(67, 2 * BEAT, 560)];
    const r = quantize(rec(notes), { splitPoint: 0 });
    expect(r.notes.find((n) => n.midi === 48)?.durationTicks).toBe(1920);
  });

  it('kürzt gleiche Tasten immer am erneuten Anschlag', () => {
    const notes = [note(60, 0, 700), note(60, BEAT, 500)];
    // erste Note (700 ms) wird am erneuten Anschlag gekürzt; zweite (500 ms ≈ 83 % eines Schlags) ist eine Viertel
    expect(q(rec(notes), { resolveOverlaps: false })).toEqual([
      [0, 480],
      [480, 480],
    ]);
  });

  it('erkennt Achteltriolen nur, wenn sie erlaubt sind', () => {
    // 6 Triolenachtel (200 ms) mit Ungenauigkeit
    const notes = [0, 1, 2, 3, 4, 5].map((i) => note(60 + i, i * 200 + jitter(i, 18), 180));
    expect(q(rec(notes), { triplets: true }).map((x) => x[0])).toEqual([0, 160, 320, 480, 640, 800]);
    // ohne Triolen: auf Sechzehntel gerastert, nie Triolenpositionen
    expect(q(rec(notes), { triplets: false }).every((x) => x[0]! % 120 === 0)).toBe(true);
  });

  it('macht aus geraden Sechzehnteln keine Triolen, auch wenn Triolen erlaubt sind', () => {
    const notes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => note(72, i * 150 + jitter(i, 12), 130));
    expect(q(rec(notes), { triplets: true }).map((x) => x[0])).toEqual([
      0, 120, 240, 360, 480, 600, 720, 840,
    ]);
  });

  it('gleicht Swing-Achtel aus', () => {
    // lang-kurz: zweite Achtel bei 2/3 des Schlags
    const notes = [0, 1, 2, 3].flatMap((b) => [
      note(67, b * BEAT, 380),
      note(64, b * BEAT + 400 + jitter(b, 15), 180),
    ]);
    // ohne Ausgleich landet die kurze Achtel auf der vierten Sechzehntel
    const straight = q(rec(notes), { swing: 0.5, grid: 16 }).map((x) => x[0]);
    expect(straight.slice(0, 2)).toEqual([0, 360]);
    expect(q(rec(notes), { swing: 0.66, grid: 16 }).map((x) => x[0])).toEqual([
      0, 240, 480, 720, 960, 1200, 1440, 1680,
    ]);
  });

  it('rastert grob auf Viertel', () => {
    const notes = [note(60, 0, 280), note(62, 310, 250), note(64, 640, 520)];
    expect(q(rec(notes), { grid: 4, minNote: 4 }).map((x) => x[0])).toEqual([0, 480, 480]);
  });

  it('trennt Hände am Split-Punkt und berechnet Takte', () => {
    const r = quantize(rec([note(48, 0, 2350), note(72, 0, 550), note(74, 5 * BEAT, 500)]), {
      splitPoint: 60,
    });
    expect(r.notes.map((n) => [n.midi, n.hand, n.track])).toEqual([
      [48, 'left', 1],
      [72, 'right', 0],
      [74, 'right', 0],
    ]);
    expect(r.measureCount).toBe(2);
    expect(r.notes[2]?.startSec).toBeCloseTo(3);
  });

  it('funktioniert in 3/4 und anderem Tempo', () => {
    const notes = [0, 1, 2, 3, 4, 5].map((i) => note(60 + i, i * 500 + jitter(i, 25), 450));
    const r = quantize(rec(notes, { bpm: 120, numerator: 3 }), { splitPoint: 0 });
    expect(r.notes.map((n) => n.startTick)).toEqual([0, 480, 960, 1440, 1920, 2400]);
    expect(r.measureTicks).toBe(1440);
    expect(r.measureCount).toBe(2);
  });
});

describe('unswing', () => {
  it('bildet Swing-Phasen auf gerade Achtel ab', () => {
    expect(unswing(0.66, 0.66)).toBeCloseTo(0.5);
    expect(unswing(0.33, 0.66)).toBeCloseTo(0.25);
    expect(unswing(0.4, 0.5)).toBe(0.4);
  });
});

describe('Aufnahme → Quantisierung → Notenschrift', () => {
  it('ergibt lesbare Noten mit Pausen, Punktierung und Bindebogen', () => {
    // Takt 1: punktierte Viertel, Achtel, Viertelpause, Viertel; Takt 2: Halbe über den Taktstrich gebunden …
    const notes = [
      note(64, 10, 870),
      note(62, 900 - 20, 280),
      note(60, 1800 + 15, 560),
      note(67, 2100 + 1200 + 20, 1150), // ab Schlag 2 von Takt 2 (Halbe)
      note(72, 4 * BEAT + 3 * BEAT - 10, 1150), // Schlag 4 → über den Taktstrich
    ];
    const r = quantize(rec(notes), { splitPoint: 0 });
    const tempo = new TempoMap(r.ppq, [{ tick: 0, bpm: r.bpm }]);
    const measures = buildMeasures(
      r.ppq,
      [{ tick: 0, numerator: 4, denominator: 4 }],
      tempo,
      r.measureCount * r.measureTicks - 1,
    );
    const score = buildNotation(r.notes, measures, r.ppq, { key: { tonicPc: 0, mode: 'major' } });
    const show = (i: number) =>
      score.measures[i]!.treble.map(
        (e) => `${e.rest ? 'r' : e.keys.join('+')}:${e.value}${'.'.repeat(e.dots)}${e.tieNext ? '~' : ''}`,
      );
    expect(show(0)).toEqual(['e/4:4.', 'd/4:8', 'r:4', 'c/4:4']);
    expect(show(1)[show(1).length - 1]).toBe('c/5:4~');
    expect(show(2)[0]).toBe('c/5:4');
  });
});

describe('Recorder', () => {
  it('zeichnet relativ zum Start auf und schließt offene Noten beim Stopp', () => {
    const r = new Recorder(1000, 100, 4, 4, 123);
    r.handle({ type: 'noteon', midi: 60, velocity: 0.5, timeMs: 990, source: 'mock' });
    r.handle({ type: 'noteon', midi: 64, velocity: 0.8, timeMs: 1600, source: 'mock' });
    r.handle({ type: 'noteoff', midi: 60, timeMs: 1500, source: 'mock' });
    r.handle({ type: 'sustain', down: true, timeMs: 1700, source: 'mock' });
    const rec = r.stop(3000);
    expect(rec.notes).toEqual([
      { midi: 60, startMs: -10, endMs: 500, velocity: 0.5 },
      { midi: 64, startMs: 600, endMs: 2000, velocity: 0.8 },
    ]);
    expect(rec.pedal).toEqual([{ timeMs: 700, down: true }]);
    expect(rec.durationMs).toBe(2000);
    expect(rec.startedAt).toBe(123);
  });
});
