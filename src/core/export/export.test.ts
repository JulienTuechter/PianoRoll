import { describe, expect, it } from 'vitest';
import { keyFifths } from '../key-detection/key';
import { loadMidiFile } from '../midi-file-loader/load';
import { buildMeasures, TempoMap } from '../note-event-model/tempo-map';
import type { Hand, NoteEvent } from '../note-event-model/types';
import { buildNotation } from '../notation-builder/notation';
import { writeMidi } from './midi-writer';
import { keyAlters, parseVexKey, toMusicXml } from './musicxml';

const PPQ = 480;

describe('Tonart-Vorzeichen', () => {
  it('kennt Dur und Moll', () => {
    expect(keyFifths({ tonicPc: 7, mode: 'major' })).toBe(1);
    expect(keyFifths({ tonicPc: 10, mode: 'major' })).toBe(-2);
    expect(keyFifths({ tonicPc: 3, mode: 'minor' })).toBe(-6);
    expect(keyFifths({ tonicPc: 9, mode: 'minor' })).toBe(0);
    expect(keyFifths(null)).toBe(0);
    expect(keyAlters(-2)).toMatchObject({ B: -1, E: -1, A: 0 });
  });
});

describe('MIDI-Export', () => {
  it('lässt sich mit dem eigenen Loader zurücklesen (Tempo, Taktart, Tonart, Hände)', () => {
    const bytes = writeMidi({
      ppq: PPQ,
      bpm: 96,
      numerator: 3,
      denominator: 4,
      key: { tonicPc: 2, mode: 'minor' },
      title: 'Aufnahme',
      tracks: [
        {
          name: 'Rechte Hand',
          channel: 0,
          notes: [
            { midi: 74, startTick: 0, durationTicks: 480, velocity: 0.8 },
            { midi: 74, startTick: 480, durationTicks: 960, velocity: 0.5 },
          ],
        },
        {
          name: 'Linke Hand',
          channel: 1,
          notes: [{ midi: 38, startTick: 0, durationTicks: 1440, velocity: 0.6 }],
          pedal: [
            { tick: 0, down: true },
            { tick: 1400, down: false },
          ],
        },
      ],
    });
    const song = loadMidiFile(bytes);
    expect(song.tempos[0]?.bpm).toBeCloseTo(96, 0);
    expect(song.timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
    expect(song.keySignatures[0]).toMatchObject({ key: 'D', scale: 'minor' });
    expect(song.tracks.map((t) => [t.name, t.handAssignment])).toEqual([
      ['Rechte Hand', 'right'],
      ['Linke Hand', 'left'],
    ]);
    // Wiederholte Taste am selben Tick: Note-Off vor Note-On → zwei getrennte Noten
    expect(song.notes.filter((n) => n.midi === 74).map((n) => [n.startTick, n.durationTicks])).toEqual([
      [0, 480],
      [480, 960],
    ]);
    expect(song.notes.find((n) => n.midi === 38)?.velocity).toBeCloseTo(0.6, 1);
  });

  it('kodiert lange Delta-Zeiten (VLQ) korrekt', () => {
    const bytes = writeMidi({
      ppq: PPQ,
      bpm: 120,
      numerator: 4,
      denominator: 4,
      key: null,
      title: 't',
      tracks: [
        {
          name: 'x',
          channel: 0,
          notes: [{ midi: 60, startTick: 200_000, durationTicks: 20_000, velocity: 1 }],
        },
      ],
    });
    const n = loadMidiFile(bytes).notes[0]!;
    expect([n.startTick, n.durationTicks]).toEqual([200_000, 20_000]);
  });
});

let id = 0;
function n(midi: number, startTick: number, durationTicks: number, hand: Hand = 'right'): NoteEvent {
  return {
    id: `x${id++}`,
    midi,
    startTick,
    durationTicks,
    startSec: 0,
    durationSec: 1,
    velocity: 0.7,
    hand,
    track: 0,
  };
}

/** Minimale Wohlgeformtheitsprüfung: öffnende/schließende Tags balanciert */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  const body = xml.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/, '');
  for (const m of body.matchAll(/<(\/?)([a-zA-Z-]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, self] = m;
    if (self) continue;
    if (closing) {
      if (stack.pop() !== name) return false;
    } else stack.push(name!);
  }
  return stack.length === 0;
}

describe('MusicXML-Export', () => {
  const tempo = new TempoMap(PPQ, [{ tick: 0, bpm: 100 }]);
  const measures = buildMeasures(PPQ, [{ tick: 0, numerator: 4, denominator: 4 }], tempo, 3 * 1920 - 1);
  const G = { tonicPc: 7, mode: 'major' as const };
  const u = PPQ / 3;
  const notes = [
    // Takt 1: Triole G A B, Viertel Bb (leiterfremd), Halbe gebunden in Takt 2
    n(67, 0, u),
    n(69, u, u),
    n(71, 2 * u, u),
    n(70, 480, 480),
    n(74, 960, 1920),
    // Takt 2 Bass: Akkord
    n(43, 1920, 960, 'left'),
    n(47, 1920, 960, 'left'),
    n(50, 1920, 960, 'left'),
    // Takt 3: B (Auflösung des Bb aus Takt 1 nicht nötig – neuer Takt)
    n(71, 3840, 480),
  ];
  const score = buildNotation(notes, measures, PPQ, { key: G });
  const xml = toMusicXml(score, { title: 'Test & <Probe>', bpm: 100, key: G });

  it('ist wohlgeformt und enthält Kopf, Tonart und Systeme', () => {
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain('<work-title>Test &amp; &lt;Probe&gt;</work-title>');
    expect(xml).toContain('<fifths>1</fifths>');
    expect(xml).toContain('<staves>2</staves>');
    expect(xml.match(/<measure /g)).toHaveLength(3);
    expect(xml).toContain('<per-minute>100</per-minute>');
  });

  it('füllt jeden Takt in beiden Systemen exakt', () => {
    for (const m of xml.split('<measure ').slice(1)) {
      const [s1, s2] = m.split('<backup>');
      const sum = (part: string) =>
        [...part.matchAll(/<note>(?!<chord\/>).*?<duration>(\d+)<\/duration>/g)].reduce(
          (s, x) => s + Number(x[1]),
          0,
        );
      expect(sum(s1!)).toBe(1920);
      expect(sum(s2!.replace(/^<duration>\d+<\/duration><\/backup>/, ''))).toBe(1920);
    }
  });

  it('setzt Triolen, Bögen über den Taktstrich, Akkorde und Versetzungszeichen', () => {
    expect(xml.match(/<time-modification>/g)).toHaveLength(3);
    expect(xml).toContain('<tuplet type="start" bracket="yes"/>');
    expect(xml).toContain('<tuplet type="stop"/>');
    expect(xml).toContain('<tie type="start"/>');
    expect(xml).toContain('<tie type="stop"/>');
    expect(xml.match(/<chord\/>/g)).toHaveLength(2);
    // Bb in G-Dur bekommt ein b; F# (Vorzeichen) bräuchte keins
    expect(xml).toMatch(/<step>B<\/step><alter>-1<\/alter>.*?<accidental>flat<\/accidental>/);
  });

  it('liest VexFlow-Tonhöhen', () => {
    expect(parseVexKey('bb/4')).toEqual({ step: 'B', alter: -1, octave: 4 });
    expect(parseVexKey('f##/5')).toEqual({ step: 'F', alter: 2, octave: 5 });
  });
});
