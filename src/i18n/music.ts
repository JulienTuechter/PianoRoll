/** Musikbegriffe in der aktuellen Sprache, berechnet aus den sprachneutralen Kerndaten. */
import type { DetectedChord } from '../core/chord-detection/chord';
import { keyTonicName, type MusicalKey } from '../core/key-detection/key';
import { t, type Messages } from '.';

const accidentals = (name: string): string => name.replace('b', '♭').replace('#', '♯');
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** „C-Dur“ / „C major“, „a-Moll“ / „A minor“ */
export function keyName(k: MusicalKey, m: Messages = t()): string {
  return m.music.key(accidentals(keyTonicName(k)), k.mode === 'minor');
}

/** Tonart aus einer MIDI-Datei („Eb“, scale „minor“) */
export function keySignatureName(tonic: string, minor: boolean, m: Messages = t()): string {
  return m.music.key(accidentals(tonic), minor);
}

/** „Moll-Septakkord, 2. Umkehrung“ / „Minor seventh, 2nd inversion“ */
export function chordDescription(c: DetectedChord, m: Messages = t()): string {
  const quality = c.quality === 'other' && c.typeName ? c.typeName : m.music.quality[c.quality];
  const inv =
    c.inversion < 0
      ? m.music.bassNote(c.bass)
      : c.inversion === 0
        ? m.music.rootPosition
        : m.music.inversion(c.inversion);
  return capitalize(`${quality}, ${inv}`);
}
