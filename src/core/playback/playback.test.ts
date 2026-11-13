import { describe, expect, it } from 'vitest';
import { FakeClock } from '../time/clock';
import type { NoteEvent } from '../note-event-model/types';
import { NoteScheduler } from './note-scheduler';
import { Transport } from './transport';

describe('Transport', () => {
  it('läuft mit der Clock und pausiert', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 10);
    t.play();
    clock.advance(1500);
    expect(t.position).toBeCloseTo(1.5);
    t.pause();
    clock.advance(1000);
    expect(t.position).toBeCloseTo(1.5);
    expect(t.state).toBe('paused');
  });

  it('berücksichtigt die Rate ohne Positionssprung', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 10);
    t.play();
    clock.advance(1000);
    t.setRate(0.5);
    expect(t.position).toBeCloseTo(1);
    clock.advance(1000);
    expect(t.position).toBeCloseTo(1.5);
  });

  it('endet am Schluss und startet beim nächsten Play von vorn', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 2);
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    t.play();
    clock.advance(3000);
    expect(t.position).toBe(2);
    expect(t.state).toBe('ended');
    t.play();
    expect(t.position).toBe(0);
    expect(states).toEqual(['playing', 'ended', 'playing']);
  });

  it('seek klemmt an die Grenzen', () => {
    const t = new Transport(new FakeClock(), 5);
    t.seek(-3);
    expect(t.position).toBe(0);
    t.seek(99);
    expect(t.position).toBe(5);
  });
});

function n(midi: number, startSec: number): NoteEvent {
  return {
    id: String(midi),
    midi,
    startTick: 0,
    startSec,
    durationSec: 0.5,
    velocity: 1,
    hand: 'right',
    track: 0,
  };
}

describe('NoteScheduler', () => {
  const notes = [n(60, 0), n(62, 0.1), n(64, 0.2), n(65, 0.3)];

  it('plant Noten im Lookahead-Fenster genau einmal', () => {
    const s = new NoteScheduler(notes, 0.15);
    s.reset(0);
    expect(s.tick(0, 1).map((x) => x.note.midi)).toEqual([60, 62]);
    expect(s.tick(0.02, 1).map((x) => x.note.midi)).toEqual([]);
    const next = s.tick(0.1, 1);
    expect(next.map((x) => x.note.midi)).toEqual([64]);
    expect(next[0]?.delaySec).toBeCloseTo(0.1);
  });

  it('teilt Verzögerung und Dauer durch die Rate', () => {
    const s = new NoteScheduler(notes, 0.5);
    s.reset(0.05);
    const out = s.tick(0.05, 0.5);
    // 0,5 s Echtzeit-Vorlauf bei halbem Tempo = 0,25 s Songzeit → Horizont 0,3
    expect(out.map((x) => x.note.midi)).toEqual([62, 64]);
    expect(out[0]?.delaySec).toBeCloseTo(0.1);
    expect(out[1]?.delaySec).toBeCloseTo(0.3);
    expect(out[0]?.durationSec).toBeCloseTo(1);
  });

  it('plant nach Seek ab der neuen Position', () => {
    const s = new NoteScheduler(notes, 0.1);
    s.reset(0);
    s.tick(0, 1);
    s.reset(0.25);
    expect(s.tick(0.25, 1).map((x) => x.note.midi)).toEqual([65]);
  });
});

describe('Transport-Haltepunkt', () => {
  it('hält am Haltepunkt und läuft ohne Sprung weiter', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 10);
    t.setHoldAt(1);
    t.play();
    clock.advance(3000);
    expect(t.position).toBe(1);
    expect(t.waiting).toBe(true);
    t.setHoldAt(null);
    expect(t.position).toBe(1);
    clock.advance(500);
    expect(t.position).toBeCloseTo(1.5);
    expect(t.waiting).toBe(false);
  });

  it('meldet Seeks separat', () => {
    const t = new Transport(new FakeClock(), 10);
    const seeks: number[] = [];
    t.onSeek((p) => seeks.push(p));
    t.seek(3);
    expect(seeks).toEqual([3]);
  });

  it('Scheduler plant nicht über den Haltepunkt hinaus', () => {
    const s = new NoteScheduler([n(60, 0), n(62, 1), n(64, 1)], 5);
    s.reset(0);
    expect(s.tick(0, 1, 1).map((x) => x.note.midi)).toEqual([60]);
    expect(s.tick(1, 1, 3).map((x) => x.note.midi)).toEqual([62, 64]);
  });
});

describe('Transport-Vorlauf (Count-in)', () => {
  it('startet vor dem Ziel, meldet aber das Ziel', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 10);
    const seeks: number[] = [];
    t.onSeek((p) => seeks.push(p));
    t.seek(2, 1.5);
    expect(t.position).toBeCloseTo(0.5);
    expect(seeks).toEqual([2]);
    t.seek(0, 2);
    expect(t.position).toBe(-2);
    t.play();
    clock.advance(1000);
    expect(t.position).toBeCloseTo(-1);
  });

  it('berechnet die Position zu einem früheren Zeitstempel', () => {
    const clock = new FakeClock();
    const t = new Transport(clock, 10);
    t.setRate(0.5);
    t.play();
    clock.advance(2000);
    expect(t.positionAt(clock.now() - 1000)).toBeCloseTo(0.5);
    expect(t.positionAt(clock.now())).toBeCloseTo(1);
  });
});
