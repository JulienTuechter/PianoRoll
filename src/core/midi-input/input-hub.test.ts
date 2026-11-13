import { describe, expect, it } from 'vitest';
import { FakeClock } from '../time/clock';
import { InputHub } from './input-hub';
import { MockMidiInput } from './mock-input';
import type { MidiInputEvent } from './types';

function setup() {
  const hub = new InputHub();
  const clock = new FakeClock();
  const mock = new MockMidiInput(hub, clock);
  const events: MidiInputEvent[] = [];
  hub.subscribe((e) => events.push(e));
  return { hub, clock, mock, events };
}

describe('InputHub', () => {
  it('hält gedrückte Tasten mit Zeitstempel', () => {
    const { hub, clock, mock } = setup();
    clock.set(100);
    mock.press(60, 0.5);
    expect(hub.pressed.get(60)).toEqual({ velocity: 0.5, timeMs: 100 });
    mock.release(60);
    expect(hub.pressed.has(60)).toBe(false);
  });

  it('dedupliziert dieselbe Taste aus zwei Quellen', () => {
    const { hub, events } = setup();
    hub.emit({ type: 'noteon', midi: 60, velocity: 1, timeMs: 0, source: 'midi' });
    hub.emit({ type: 'noteon', midi: 60, velocity: 1, timeMs: 1, source: 'keyboard' });
    hub.emit({ type: 'noteoff', midi: 60, timeMs: 2, source: 'midi' });
    expect(hub.pressed.has(60)).toBe(true);
    hub.emit({ type: 'noteoff', midi: 60, timeMs: 3, source: 'keyboard' });
    expect(events.map((e) => e.type)).toEqual(['noteon', 'noteoff']);
  });

  it('ignoriert Note Off ohne vorheriges Note On', () => {
    const { events, hub } = setup();
    hub.emit({ type: 'noteoff', midi: 61, timeMs: 0, source: 'midi' });
    expect(events).toHaveLength(0);
  });

  it('führt Pedal-gehaltene Noten', () => {
    const { hub, mock } = setup();
    mock.pedal(true);
    mock.press(60);
    mock.release(60);
    expect(hub.isSounding(60)).toBe(true);
    expect(hub.sustained.has(60)).toBe(true);
    mock.press(60);
    expect(hub.sustained.has(60)).toBe(false);
    mock.release(60);
    mock.pedal(false);
    expect(hub.isSounding(60)).toBe(false);
  });

  it('meldet Pedalwechsel nur bei Änderung des Gesamtzustands', () => {
    const { hub, events } = setup();
    hub.emit({ type: 'sustain', down: true, timeMs: 0, source: 'midi' });
    hub.emit({ type: 'sustain', down: true, timeMs: 0, source: 'keyboard' });
    hub.emit({ type: 'sustain', down: false, timeMs: 0, source: 'midi' });
    expect(hub.sustainDown).toBe(true);
    hub.emit({ type: 'sustain', down: false, timeMs: 0, source: 'keyboard' });
    expect(events.map((e) => e.type === 'sustain' && e.down)).toEqual([true, false]);
  });

  it('releaseSource löst hängende Noten einer Quelle', () => {
    const { hub, mock } = setup();
    hub.emit({ type: 'noteon', midi: 40, velocity: 1, timeMs: 0, source: 'midi' });
    mock.chord([60, 64, 67]);
    mock.pedal(true);
    mock.releaseAll();
    expect([...hub.pressed.keys()]).toEqual([40]);
    expect(hub.sustainDown).toBe(false);
  });
});
