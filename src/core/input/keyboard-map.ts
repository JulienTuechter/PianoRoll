/**
 * Computertastatur → MIDI. Verwendet KeyboardEvent.code (physische Taste), funktioniert daher
 * mit QWERTZ und QWERTY gleich. Untere Reihe = Oktave `baseOctave`, obere Reihe = eine Oktave höher.
 *
 *   untere Reihe:  S D   G H J        obere Reihe:  2 3   5 6 7
 *                 Y X C V B N M ,                 Q W E R T Z U I
 *   (deutsche Beschriftung; auf QWERTY entspricht Y → Z und Z → Y)
 */
const LOWER: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  Comma: 12,
  Period: 14,
};
const UPPER: Record<string, number> = {
  KeyQ: 12,
  Digit2: 13,
  KeyW: 14,
  Digit3: 15,
  KeyE: 16,
  KeyR: 17,
  Digit5: 18,
  KeyT: 19,
  Digit6: 20,
  KeyY: 21,
  Digit7: 22,
  KeyU: 23,
  KeyI: 24,
  Digit9: 25,
  KeyO: 26,
  Digit0: 27,
  KeyP: 28,
};

export const MIN_SIM_OCTAVE = 1;
export const MAX_SIM_OCTAVE = 6;

export function keyCodeToMidi(code: string, baseOctave: number): number | null {
  const offset = LOWER[code] ?? UPPER[code];
  if (offset === undefined) return null;
  const midi = (baseOctave + 1) * 12 + offset;
  return midi >= 21 && midi <= 108 ? midi : null;
}

/** Tasten, die der Simulator für sich beansprucht (für Konfliktprüfung mit Shortcuts). */
export function isSimulatorKey(code: string): boolean {
  return code in LOWER || code in UPPER;
}

/** Beschriftung der Taste für eine MIDI-Note bei gegebener Oktave (für Overlay auf der Klaviatur). */
export function labelForMidi(midi: number, baseOctave: number, layout: 'de' | 'en' = 'de'): string | null {
  const offset = midi - (baseOctave + 1) * 12;
  const entry =
    Object.entries(LOWER).find(([, v]) => v === offset && offset < 12) ??
    Object.entries(UPPER).find(([, v]) => v === offset);
  if (!entry) return null;
  return codeLabel(entry[0], layout);
}

function codeLabel(code: string, layout: 'de' | 'en'): string {
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  const ch = code.replace(/^Key|^Digit/, '');
  if (layout === 'de') {
    if (ch === 'Z') return 'Y';
    if (ch === 'Y') return 'Z';
  }
  return ch;
}
