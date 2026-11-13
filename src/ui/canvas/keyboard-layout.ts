import { PIANO_MAX_MIDI, PIANO_MIN_MIDI } from '../../core/note-event-model/types';
import { isBlackKey } from '../../core/note-event-model/notes';

export interface KeyRect {
  midi: number;
  x: number;
  w: number;
  black: boolean;
}

export interface KeyboardLayout {
  width: number;
  whiteWidth: number;
  blackWidth: number;
  keys: KeyRect[];
  /** Index = MIDI-Nummer */
  byMidi: (KeyRect | undefined)[];
  whites: KeyRect[];
  blacks: KeyRect[];
}

/** Verschiebung schwarzer Tasten relativ zur Fuge zwischen zwei weißen Tasten (in Weißtastenbreiten). */
const BLACK_SHIFT: Record<number, number> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };
export const BLACK_WIDTH_RATIO = 0.58;
export const BLACK_HEIGHT_RATIO = 0.62;

export function computeKeyboardLayout(
  width: number,
  minMidi = PIANO_MIN_MIDI,
  maxMidi = PIANO_MAX_MIDI,
): KeyboardLayout {
  let whiteCount = 0;
  for (let m = minMidi; m <= maxMidi; m++) if (!isBlackKey(m)) whiteCount++;
  const whiteWidth = width / Math.max(1, whiteCount);
  const blackWidth = whiteWidth * BLACK_WIDTH_RATIO;

  const keys: KeyRect[] = [];
  const byMidi: (KeyRect | undefined)[] = [];
  let whiteIndex = 0;
  for (let m = minMidi; m <= maxMidi; m++) {
    let key: KeyRect;
    if (isBlackKey(m)) {
      const seam = whiteIndex * whiteWidth;
      const center = seam + (BLACK_SHIFT[m % 12] ?? 0) * whiteWidth;
      key = { midi: m, x: center - blackWidth / 2, w: blackWidth, black: true };
    } else {
      key = { midi: m, x: whiteIndex * whiteWidth, w: whiteWidth, black: false };
      whiteIndex++;
    }
    keys.push(key);
    byMidi[m] = key;
  }
  return {
    width,
    whiteWidth,
    blackWidth,
    keys,
    byMidi,
    whites: keys.filter((k) => !k.black),
    blacks: keys.filter((k) => k.black),
  };
}

/** Welche Taste liegt unter (x, y)? y relativ zur Oberkante der Klaviatur. Schwarze Tasten zuerst. */
export function hitTestKey(
  layout: KeyboardLayout,
  x: number,
  y: number,
  keyboardHeight: number,
): number | null {
  if (x < 0 || x >= layout.width || y < 0 || y > keyboardHeight) return null;
  if (y < keyboardHeight * BLACK_HEIGHT_RATIO) {
    for (const k of layout.blacks) if (x >= k.x && x < k.x + k.w) return k.midi;
  }
  const idx = Math.floor(x / layout.whiteWidth);
  return layout.whites[idx]?.midi ?? null;
}
