import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { assignHands, type TrackSummary } from './hands';
import { MidiFileError, loadMidiFile, playableNotes, reassignHands, titleFromFileName } from './load';

function buildMidi(setup: (m: Midi) => void): Uint8Array {
  const m = new Midi();
  setup(m);
  return m.toArray();
}

function summary(index: number, over: Partial<TrackSummary> = {}): TrackSummary {
  return { index, name: '', program: 0, isPercussion: false, noteCount: 10, averagePitch: 60, ...over };
}

describe('assignHands', () => {
  it('ordnet zwei Klavier-Tracks nach Lage zu', () => {
    const r = assignHands([summary(0, { averagePitch: 72 }), summary(1, { averagePitch: 45 })]);
    expect(r.get(0)?.hand).toBe('right');
    expect(r.get(1)?.hand).toBe('left');
  });

  it('bevorzugt Tracknamen vor der Lage', () => {
    const r = assignHands([
      summary(0, { name: 'Piano LH', averagePitch: 70 }),
      summary(1, { name: 'Piano RH', averagePitch: 50 }),
    ]);
    expect(r.get(0)?.hand).toBe('left');
    expect(r.get(1)?.hand).toBe('right');
  });

  it('nutzt Split bei nur einem Track', () => {
    const r = assignHands([summary(0)]);
    expect(r.get(0)).toEqual({ hand: 'split', enabled: true });
  });

  it('nimmt die beiden Klavier-Tracks aus einem größeren Arrangement', () => {
    const r = assignHands([
      summary(0, { program: 40, averagePitch: 80 }), // Violine
      summary(1, { averagePitch: 70 }),
      summary(2, { averagePitch: 48 }),
      summary(3, { isPercussion: true }),
      summary(4, { noteCount: 0 }),
    ]);
    expect(r.get(0)).toEqual({ hand: 'split', enabled: true });
    expect(r.get(1)?.hand).toBe('right');
    expect(r.get(2)?.hand).toBe('left');
    expect(r.get(3)?.enabled).toBe(false);
    expect(r.get(4)?.enabled).toBe(false);
  });

  it('nutzt Split bei drei Klavier-Tracks', () => {
    const r = assignHands([summary(0), summary(1), summary(2)]);
    expect([...r.values()].every((x) => x.hand === 'split')).toBe(true);
  });
});

describe('loadMidiFile', () => {
  it('lädt Tempo, Taktart, Noten und Split-Zuordnung', () => {
    const bytes = buildMidi((m) => {
      m.header.setTempo(100);
      m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
      // Der Encoder von @tonejs/midi schreibt Tonarten fehlerhaft → muss beim Lesen verworfen werden
      m.header.keySignatures.push({ ticks: 0, key: 'G', scale: 'major' });
      const t = m.addTrack();
      t.name = 'Piano';
      t.addNote({ midi: 48, ticks: 0, durationTicks: 480 });
      t.addNote({ midi: 72, ticks: 0, durationTicks: 480 });
      t.addNote({ midi: 60, ticks: 480, durationTicks: 240 });
    });
    const song = loadMidiFile(bytes, { title: 'Test' });
    expect(song.title).toBe('Test');
    expect(song.tempos[0]?.bpm).toBeCloseTo(100);
    expect(song.timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4, measure: 0 });
    expect(song.keySignatures.every((k) => typeof k.key === 'string')).toBe(true);
    expect(song.notes.map((n) => [n.midi, n.hand])).toEqual([
      [48, 'left'],
      [72, 'right'],
      [60, 'right'],
    ]);
    expect(song.notes[2]?.startSec).toBeCloseTo(0.6); // 480 Ticks bei 100 BPM
    expect(song.durationSec).toBeCloseTo(0.9);
    expect(song.id).toMatch(/^[0-9a-f]+$/);
  });

  it('erkennt zwei Hände-Tracks', () => {
    const bytes = buildMidi((m) => {
      const r = m.addTrack();
      r.addNote({ midi: 55, ticks: 0, durationTicks: 100 }); // unter Mittel-C, aber rechte Hand
      r.addNote({ midi: 76, ticks: 100, durationTicks: 100 });
      const l = m.addTrack();
      l.addNote({ midi: 36, ticks: 0, durationTicks: 100 });
    });
    const song = loadMidiFile(bytes);
    expect(song.tracks.map((t) => t.handAssignment)).toEqual(['right', 'left']);
    expect(song.notes.find((n) => n.midi === 55)?.hand).toBe('right');
  });

  it('wendet einen neuen Split-Punkt und manuelle Korrektur an', () => {
    const bytes = buildMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 55, ticks: 0, durationTicks: 100 });
      t.addNote({ midi: 65, ticks: 0, durationTicks: 100 });
      const drums = m.addTrack();
      drums.channel = 9;
      drums.addNote({ midi: 36, ticks: 0, durationTicks: 10 });
    });
    const song = loadMidiFile(bytes);
    expect(song.tracks[1]?.enabled).toBe(false);
    expect(playableNotes(song)).toHaveLength(2);

    const moved = reassignHands(song, song.tracks, 54);
    expect(moved.notes.filter((n) => n.track === 0).map((n) => n.hand)).toEqual(['right', 'right']);

    const tracks = song.tracks.map((t) => (t.index === 0 ? { ...t, handAssignment: 'left' as const } : t));
    const forced = reassignHands(song, tracks, 60);
    expect(forced.notes.filter((n) => n.track === 0).every((n) => n.hand === 'left')).toBe(true);
  });

  it('wirft verständliche Fehler', () => {
    expect(() => loadMidiFile(new Uint8Array([1, 2, 3]))).toThrow(MidiFileError);
    expect(() => loadMidiFile(buildMidi((m) => m.addTrack()))).toThrow(/keine Noten/);
  });

  it('erzeugt Titel aus Dateinamen', () => {
    expect(titleFromFileName('Fur_Elise.mid')).toBe('Fur Elise');
    expect(titleFromFileName('x.MIDI')).toBe('x');
  });
});

describe('Demo-Stück', () => {
  it('lässt sich laden und hat zwei Hände', async () => {
    const { createDemoMidi } = await import('../demo/demo-song');
    const song = loadMidiFile(createDemoMidi());
    expect(song.title).toBe('Demo - Erste Schritte');
    expect(song.tracks.map((t) => t.handAssignment)).toEqual(['right', 'left']);
    expect(song.notes.length).toBeGreaterThan(40);
  });
});
