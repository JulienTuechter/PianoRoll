import type { Hand, HandAssignment, NoteEvent, TrackInfo } from '../note-event-model/types';

export interface TrackSummary {
  index: number;
  name: string;
  program: number;
  isPercussion: boolean;
  noteCount: number;
  averagePitch: number;
}

const LEFT_NAME = /\b(left|links|lh|l\.?\s?h\.?|bass)\b|linke/i;
const RIGHT_NAME = /\b(right|rechts|rh|r\.?\s?h\.?|melody|melodie)\b|rechte/i;

/** GM-Programme 0–7 sind Klaviere. Programm -1 (unbekannt) zählt ebenfalls als Klavier. */
export function isPianoProgram(program: number): boolean {
  return program >= -1 && program <= 7;
}

/**
 * Bestimmt die Hände-Zuordnung pro Track:
 * - Genau zwei Klavier-Tracks mit Noten → einer links, einer rechts (Name hat Vorrang, sonst tiefere Durchschnittslage = links).
 * - Sonst wird jeder Track per Split-Punkt aufgeteilt.
 * Schlagzeug und leere Tracks werden deaktiviert.
 */
export function assignHands(
  tracks: readonly TrackSummary[],
): Map<number, { hand: HandAssignment; enabled: boolean }> {
  const result = new Map<number, { hand: HandAssignment; enabled: boolean }>();
  const playable = tracks.filter((t) => !t.isPercussion && t.noteCount > 0);
  for (const t of tracks) result.set(t.index, { hand: 'split', enabled: playable.includes(t) });

  const pianos = playable.filter((t) => isPianoProgram(t.program));
  const pair = pianos.length === 2 ? pianos : playable.length === 2 ? playable : null;
  if (!pair) return result;

  const [a, b] = pair as [TrackSummary, TrackSummary];
  const aLeft = LEFT_NAME.test(a.name);
  const aRight = RIGHT_NAME.test(a.name);
  const bLeft = LEFT_NAME.test(b.name);
  const bRight = RIGHT_NAME.test(b.name);

  let left: TrackSummary;
  if (aLeft && !bLeft) left = a;
  else if (bLeft && !aLeft) left = b;
  else if (aRight && !bRight) left = b;
  else if (bRight && !aRight) left = a;
  else left = a.averagePitch <= b.averagePitch ? a : b;
  const right = left === a ? b : a;

  result.set(left.index, { hand: 'left', enabled: true });
  result.set(right.index, { hand: 'right', enabled: true });
  return result;
}

export function handForNote(midi: number, assignment: HandAssignment, splitPoint: number): Hand {
  if (assignment === 'split') return midi < splitPoint ? 'left' : 'right';
  return assignment;
}

/** Setzt die Hand jeder Note neu – z. B. nach Änderung des Split-Punkts oder manueller Track-Korrektur. */
export function applyHands(
  notes: readonly NoteEvent[],
  tracks: readonly TrackInfo[],
  splitPoint: number,
): NoteEvent[] {
  return notes.map((n) => {
    const t = tracks[n.track];
    const hand = handForNote(n.midi, t?.handAssignment ?? 'split', splitPoint);
    return hand === n.hand ? n : { ...n, hand };
  });
}
