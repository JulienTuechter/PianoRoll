import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './parse';

describe('parseMidiMessage', () => {
  it('parst Note On mit Velocity', () => {
    expect(parseMidiMessage([0x90, 60, 127], 10)).toEqual({
      type: 'noteon',
      midi: 60,
      velocity: 1,
      timeMs: 10,
      source: 'midi',
    });
  });

  it('behandelt Note On mit Velocity 0 als Note Off', () => {
    expect(parseMidiMessage([0x90, 60, 0], 5)).toEqual({
      type: 'noteoff',
      midi: 60,
      timeMs: 5,
      source: 'midi',
    });
  });

  it('parst Note Off auf beliebigem Kanal', () => {
    expect(parseMidiMessage([0x83, 21, 64], 1)?.type).toBe('noteoff');
    expect(parseMidiMessage([0x9f, 108, 1], 1)).toMatchObject({ type: 'noteon', midi: 108 });
  });

  it('parst Sustain-Pedal (CC64) mit Schwelle 64', () => {
    expect(parseMidiMessage([0xb0, 64, 127], 0)).toMatchObject({ type: 'sustain', down: true });
    expect(parseMidiMessage([0xb0, 64, 63], 0)).toMatchObject({ type: 'sustain', down: false });
    expect(parseMidiMessage([0xb0, 64, 64], 0)).toMatchObject({ type: 'sustain', down: true });
  });

  it('ignoriert andere Nachrichten und unvollständige Daten', () => {
    expect(parseMidiMessage([0xb0, 7, 100], 0)).toBeNull(); // Volume
    expect(parseMidiMessage([0xfe], 0)).toBeNull(); // Active Sensing
    expect(parseMidiMessage([0xf8], 0)).toBeNull(); // Clock
    expect(parseMidiMessage([0x90, 60], 0)).toBeNull();
    expect(parseMidiMessage([], 0)).toBeNull();
    expect(parseMidiMessage([60, 100], 0)).toBeNull();
  });
});
