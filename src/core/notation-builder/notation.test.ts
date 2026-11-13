import { describe, expect, it } from 'vitest';
import { createDemoMidi } from '../demo/demo-song';
import { pcName, speller } from '../key-detection/key';
import { loadMidiFile } from '../midi-file-loader/load';
import { buildMeasures, TempoMap } from '../note-event-model/tempo-map';
import type { Hand, NoteEvent } from '../note-event-model/types';
import {
  buildNotation,
  chordsForStaff,
  splitDuration,
  vexKey,
  vexKeySpec,
  type NotationEvent,
} from './notation';

const PPQ = 480;
const tempo = new TempoMap(PPQ, [{ tick: 0, bpm: 120 }]);
const measures44 = (count: number) =>
  buildMeasures(PPQ, [{ tick: 0, numerator: 4, denominator: 4 }], tempo, count * 1920 - 1);

let id = 0;
function n(midi: number, startTick: number, durationTicks: number, hand: Hand = 'right'): NoteEvent {
  return {
    id: `n${id++}`,
    midi,
    startTick,
    durationTicks,
    startSec: tempo.tickToSec(startTick),
    durationSec: tempo.tickToSec(startTick + durationTicks) - tempo.tickToSec(startTick),
    velocity: 0.8,
    hand,
    track: 0,
  };
}

const show = (evs: NotationEvent[]) =>
  evs.map((e) => `${e.rest ? 'r' : e.keys.join('+')}:${e.value}${'.'.repeat(e.dots)}${e.tieNext ? '~' : ''}`);

describe('Notenwerte zerlegen', () => {
  it('nutzt Punktierungen und Zählzeiten', () => {
    expect(splitDuration(0, 720, PPQ).map((p) => `${p.value}${p.dots ? '.' : ''}`)).toEqual(['4.']);
    expect(splitDuration(0, 1920, PPQ).map((p) => p.value)).toEqual(['1']);
    expect(splitDuration(0, 1440, PPQ).map((p) => `${p.value}${p.dots ? '.' : ''}`)).toEqual(['2.']);
    // Punktierte Viertel auf der „und“ wird zerlegt
    expect(splitDuration(240, 720, PPQ).map((p) => `${p.value}${p.dots ? '.' : ''}`)).toEqual(['8', '4']);
    // drei Schläge ab Schlag 2 → Viertel + Halbe
    expect(splitDuration(480, 1440, PPQ).map((p) => `${p.value}${p.dots ? '.' : ''}`)).toEqual(['4', '2']);
    // 5 Achtel ab Taktbeginn → Halbe + Achtel
    expect(splitDuration(0, 1200, PPQ).map((p) => p.value)).toEqual(['2', '8']);
    // 3/4: Halbe auf Schlag 2 bleibt eine Halbe
    expect(splitDuration(480, 960, PPQ, { numerator: 3, denominator: 4 }).map((p) => p.value)).toEqual(['2']);
    // 4/4: Pausen überbrücken die Taktmitte nicht → zwei Viertel; Noten dürfen synkopieren (♩ 𝅗𝅥 ♩)
    expect(splitDuration(480, 960, PPQ).map((p) => p.value)).toEqual(['4', '4']);
    expect(splitDuration(480, 960, PPQ, { numerator: 4, denominator: 4 }, true).map((p) => p.value)).toEqual([
      '2',
    ]);
    // punktierte Werte nie über die Taktmitte, auch nicht bei Noten
    expect(splitDuration(480, 1440, PPQ, { numerator: 4, denominator: 4 }, true).map((p) => p.value)).toEqual(
      ['2', '4'],
    );
  });
});

describe('Rastern und Akkorde', () => {
  it('fasst gleichzeitige Töne zusammen und rastert leicht ungenaue Starts', () => {
    const chords = chordsForStaff([n(60, 0, 480), n(64, 7, 470), n(67, 0, 480), n(62, 485, 470)], PPQ, 120);
    expect(chords.map((c) => [c.start, c.notes.length])).toEqual([
      [0, 3],
      [480, 1],
    ]);
  });

  it('kürzt Akkorde bis zum nächsten Anschlag (eine Stimme)', () => {
    const chords = chordsForStaff([n(48, 0, 1920), n(52, 480, 480)], PPQ, 120);
    expect(chords[0]?.end).toBe(480);
  });
});

describe('buildNotation', () => {
  it('füllt Lücken mit Pausen und leere Takte mit Ganztaktpausen', () => {
    const score = buildNotation([n(60, 480, 480)], measures44(2), PPQ, { key: null });
    expect(show(score.measures[0]!.treble)).toEqual(['r:4', 'c/4:4', 'r:2']);
    expect(score.measures[0]!.bass[0]).toMatchObject({ rest: true, wholeMeasureRest: true });
    expect(score.measures[1]!.treble[0]?.wholeMeasureRest).toBe(true);
  });

  it('bindet Noten über den Taktstrich', () => {
    const score = buildNotation([n(67, 1440, 960)], measures44(2), PPQ, { key: null });
    expect(show(score.measures[0]!.treble)).toEqual(['r:2.', 'g/4:4~']);
    expect(show(score.measures[1]!.treble)).toEqual(['g/4:4', 'r:4', 'r:2']);
  });

  it('trennt die Hände in Violin- und Bassschlüssel', () => {
    const score = buildNotation([n(72, 0, 1920), n(36, 0, 1920, 'left')], measures44(1), PPQ, { key: null });
    expect(show(score.measures[0]!.treble)).toEqual(['c/5:1']);
    expect(show(score.measures[0]!.bass)).toEqual(['c/2:1']);
  });

  it('schreibt Töne nach Tonart und liefert die Tonart für VexFlow', () => {
    const F = { tonicPc: 5, mode: 'major' as const };
    expect(vexKey(70, (p) => pcName(p, true))).toBe('bb/4');
    // E# in F#-Dur: Oktave nach Stammton (E#4 klingt wie F4)
    expect(vexKey(65, speller({ tonicPc: 6, mode: 'major' }))).toBe('e#/4');
    // Cb5 klingt wie B4
    expect(vexKey(71, () => 'Cb')).toBe('cb/5');
    const score = buildNotation([n(70, 0, 1920)], measures44(1), PPQ, { key: F });
    expect(score.measures[0]!.treble[0]?.keys).toEqual(['bb/4']);
    expect(score.keySpec).toBe('F');
    expect(vexKeySpec({ tonicPc: 7, mode: 'minor' })).toBe('Gm');
    expect(vexKeySpec({ tonicPc: 10, mode: 'minor' })).toBe('Bbm');
  });

  it('markiert Taktartwechsel', () => {
    const ms = buildMeasures(
      PPQ,
      [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 3, denominator: 4 },
      ],
      tempo,
      1920 + 1440 * 2 - 1,
    );
    const score = buildNotation([], ms, PPQ, { key: null });
    expect(score.measures.map((m) => m.timeSigChange)).toEqual([true, true, false]);
    expect(score.measures[1]!.endTick - score.measures[1]!.startTick).toBe(1440);
  });

  it('setzt Achteltriolen als Gruppe und gemischte Triolen (Viertel + Achtel)', () => {
    const u = PPQ / 3;
    const notes = [
      n(60, 0, u),
      n(62, u, u),
      n(64, 2 * u, u),
      n(65, 480, 2 * u),
      n(67, 480 + 2 * u, u),
      n(69, 960, 960),
    ];
    const score = buildNotation(notes, measures44(1), PPQ, { key: null });
    const t = score.measures[0]!.treble;
    expect(t.map((e) => `${e.value}${e.tuplet !== null ? 't' + e.tuplet : ''}`)).toEqual([
      '8t0',
      '8t0',
      '8t0',
      '4t480',
      '8t480',
      '2',
    ]);
    expect(t.reduce((s, e) => s + e.durationTicks, 0)).toBe(1920);
  });

  it('setzt Pausen in Triolenschlägen ebenfalls als Triolen', () => {
    const u = PPQ / 3;
    const score = buildNotation([n(60, u, u)], measures44(1), PPQ, { key: null });
    expect(
      score.measures[0]!.treble.map((e) => `${e.rest ? 'r' : 'n'}${e.value}${e.tuplet !== null ? 't' : ''}`),
    ).toEqual(['r8t', 'n8t', 'r8t', 'r4', 'r2']);
  });

  it('setzt das Demo-Stück korrekt (Takt 1: E F G, Bass C + Akkord)', () => {
    const song = loadMidiFile(createDemoMidi());
    const t = new TempoMap(song.ppq, song.tempos);
    const ms = buildMeasures(song.ppq, song.timeSignatures, t, t.secToTick(song.durationSec) - 1);
    const score = buildNotation(song.notes, ms, song.ppq, { key: { tonicPc: 0, mode: 'major' } });
    expect(score.measures).toHaveLength(8);
    expect(show(score.measures[0]!.treble)).toEqual(['e/4:4', 'f/4:4', 'g/4:2']);
    expect(show(score.measures[0]!.bass)).toEqual(['c/3:2', 'g/3+c/4+e/4:2']);
    expect(show(score.measures[7]!.treble)).toEqual(['c/5:1']);
    // Jeder Takt ist vollständig gefüllt
    for (const m of score.measures) {
      for (const staff of [m.treble, m.bass]) {
        expect(staff.reduce((s, e) => s + e.durationTicks, 0)).toBe(m.endTick - m.startTick);
      }
    }
  });
});
