import { describe, expect, it } from 'vitest';
import { createDemoMidi } from '../demo/demo-song';
import { pcName } from '../key-detection/key';
import { loadMidiFile } from '../midi-file-loader/load';
import { buildMeasures, TempoMap } from '../note-event-model/tempo-map';
import type { NoteEvent } from '../note-event-model/types';
import { buildBeatGrid } from '../practice-engine/beats';
import {
  analyzeSongChords,
  chordFromWeights,
  harmonicWindows,
  segmentIndexAt,
  windowWeights,
} from './song-chords';

const spell = (p: number) => pcName(p, false);

describe('Akkordanalyse im Stück', () => {
  it('teilt 4/4 in Halbtakte und 3/4 in ganze Takte', () => {
    const tempo = new TempoMap(480, [{ tick: 0, bpm: 120 }]);
    const measures = buildMeasures(
      480,
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 4 },
      ],
      tempo,
      1920 + 1440 - 1,
    );
    const w = harmonicWindows(measures, buildBeatGrid(measures, 480, tempo), 3.5);
    expect(w.map((x) => [x.startSec, x.endSec])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3.5],
    ]);
  });

  it('verwirft schwache Durchgangstöne', () => {
    const n = (midi: number, s: number, d: number): NoteEvent => ({
      id: `${midi}`,
      midi,
      startTick: 0,
      startSec: s,
      durationSec: d,
      velocity: 1,
      hand: 'right',
      track: 0,
    });
    const { weights, lowest } = windowWeights([n(48, 0, 2), n(52, 0, 2), n(55, 0, 2), n(62, 1, 0.1)], {
      startSec: 0,
      endSec: 2,
    });
    expect(chordFromWeights(weights, lowest === null ? null : lowest % 12, spell)?.symbol).toBe('C');
  });

  it('erkennt die Akkordfolge des Demo-Stücks (I – vi – IV – V …)', () => {
    const song = loadMidiFile(createDemoMidi());
    const tempo = new TempoMap(song.ppq, song.tempos);
    const measures = buildMeasures(
      song.ppq,
      song.timeSignatures,
      tempo,
      tempo.secToTick(song.durationSec) - 1,
    );
    const windows = harmonicWindows(measures, buildBeatGrid(measures, song.ppq, tempo), song.durationSec);
    const segs = analyzeSongChords(song.notes, windows, spell);
    expect(segs.map((s) => s.chord?.symbol)).toEqual(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'C']);
    expect(segs.map((s) => s.measure)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(segmentIndexAt(segs, 0)).toBe(0);
    expect(segmentIndexAt(segs, -1)).toBe(-1);
    expect(segmentIndexAt(segs, segs[2]!.startSec + 0.01)).toBe(2);
  });
});
