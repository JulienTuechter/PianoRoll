import { describe, expect, it } from 'vitest';
import { keyCodeToMidi, labelForMidi } from './keyboard-map';

describe('keyCodeToMidi', () => {
  it('bildet die untere Reihe auf die Basisoktave ab', () => {
    expect(keyCodeToMidi('KeyZ', 4)).toBe(60); // deutsch: Y
    expect(keyCodeToMidi('KeyS', 4)).toBe(61);
    expect(keyCodeToMidi('KeyM', 4)).toBe(71);
  });

  it('bildet die obere Reihe eine Oktave höher ab', () => {
    expect(keyCodeToMidi('KeyQ', 4)).toBe(72);
    expect(keyCodeToMidi('Digit2', 4)).toBe(73);
    expect(keyCodeToMidi('KeyI', 4)).toBe(84);
  });

  it('respektiert die Oktavverschiebung und den Klavierumfang', () => {
    expect(keyCodeToMidi('KeyZ', 2)).toBe(36);
    expect(keyCodeToMidi('KeyZ', 0)).toBeNull(); // C0 < A0
    expect(keyCodeToMidi('KeyF', 4)).toBeNull();
  });

  it('liefert Beschriftungen passend zum Layout', () => {
    expect(labelForMidi(60, 4, 'de')).toBe('Y');
    expect(labelForMidi(60, 4, 'en')).toBe('Z');
    expect(labelForMidi(81, 4, 'de')).toBe('Z');
    expect(labelForMidi(72, 4)).toBe('Q');
  });
});
