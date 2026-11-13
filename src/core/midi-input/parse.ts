import type { InputSource, MidiInputEvent } from './types';

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const CC_SUSTAIN = 64;

/**
 * Wandelt eine rohe MIDI-Nachricht in ein Event um. Unbekannte/irrelevante Nachrichten → null.
 * Note On mit Velocity 0 wird als Note Off behandelt. Kanal wird ignoriert.
 */
export function parseMidiMessage(
  data: ArrayLike<number>,
  timeMs: number,
  source: InputSource = 'midi',
): MidiInputEvent | null {
  const status = data[0];
  if (status === undefined || status < 0x80) return null;
  const kind = status & 0xf0;
  const d1 = data[1];
  const d2 = data[2];
  if (d1 === undefined || d2 === undefined) return null;

  switch (kind) {
    case NOTE_ON:
      if (d2 === 0) return { type: 'noteoff', midi: d1, timeMs, source };
      return { type: 'noteon', midi: d1, velocity: d2 / 127, timeMs, source };
    case NOTE_OFF:
      return { type: 'noteoff', midi: d1, timeMs, source };
    case CONTROL_CHANGE:
      if (d1 === CC_SUSTAIN) return { type: 'sustain', down: d2 >= 64, timeMs, source };
      return null;
    default:
      return null;
  }
}
