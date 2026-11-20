import { describe, expect, it } from 'vitest';
import { writeMidi } from '../export/midi-writer';
import { loadMidiFile } from '../midi-file-loader/load';
import { mergePedalSpans, pedalEvents, pedalSpans } from './pedal';

describe('Haltepedal', () => {
  it('bildet Abschnitte aus Drücken und Loslassen', () => {
    expect(
      pedalSpans(
        [
          { tick: 0, down: true },
          { tick: 100, down: true }, // erneut gedrückt, ohne loszulassen
          { tick: 480, down: false },
          { tick: 500, down: false }, // Loslassen ohne Drücken
          { tick: 960, down: true },
        ],
        1920,
      ),
    ).toEqual([
      { startTick: 0, endTick: 480 },
      { startTick: 960, endTick: 1920 },
    ]);
  });

  it('behält Pedalwechsel und vereinigt überlappendes Pedal mehrerer Spuren', () => {
    const a = pedalSpans(
      [
        { tick: 480, down: true }, // gleicher Tick: Loslassen zuerst
        { tick: 480, down: false },
        { tick: 0, down: true },
        { tick: 960, down: false },
      ],
      1920,
    );
    expect(a).toEqual([
      { startTick: 0, endTick: 480 },
      { startTick: 480, endTick: 960 },
    ]);
    const b = pedalSpans(
      [
        { tick: 900, down: true },
        { tick: 1200, down: false },
      ],
      1920,
    );
    expect(mergePedalSpans([a, b])).toEqual([
      { startTick: 0, endTick: 480 },
      { startTick: 480, endTick: 1200 },
    ]);
    expect(pedalEvents([{ startTick: 10, endTick: 20 }])).toEqual([
      { tick: 10, down: true },
      { tick: 20, down: false },
    ]);
  });

  it('übersteht die Rundreise MIDI-Export → Laden', () => {
    const bytes = writeMidi({
      ppq: 480,
      bpm: 120,
      numerator: 4,
      denominator: 4,
      key: null,
      title: 'Pedal',
      tracks: [
        {
          name: 'R',
          channel: 0,
          notes: [{ midi: 60, startTick: 0, durationTicks: 1920, velocity: 0.7 }],
          pedal: pedalEvents([
            { startTick: 0, endTick: 960 },
            { startTick: 960, endTick: 1800 },
          ]),
        },
      ],
    });
    const song = loadMidiFile(bytes);
    expect(song.pedals).toEqual([
      { startTick: 0, endTick: 960 },
      { startTick: 960, endTick: 1800 },
    ]);
  });

  it('lässt pedals weg, wenn die Datei kein Pedal hat', () => {
    const bytes = writeMidi({
      ppq: 480,
      bpm: 120,
      numerator: 4,
      denominator: 4,
      key: null,
      title: 'Ohne',
      tracks: [
        { name: 'R', channel: 0, notes: [{ midi: 60, startTick: 0, durationTicks: 480, velocity: 0.7 }] },
      ],
    });
    expect(loadMidiFile(bytes).pedals).toBeUndefined();
  });
});
