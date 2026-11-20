import type { PedalSpan } from './types';

export interface PedalEvent {
  tick: number;
  down: boolean;
}

/**
 * Pedal-Ereignisse einer Spur → Abschnitte „gedrückt“.
 * Wiederholtes Drücken ohne Loslassen verlängert, Loslassen ohne Drücken wird ignoriert;
 * ein am Ende noch gedrücktes Pedal endet bei `endTick`. Bei gleichem Tick gilt Loslassen vor Drücken
 * (Pedalwechsel: zwei aneinanderstoßende Abschnitte).
 */
export function pedalSpans(events: readonly PedalEvent[], endTick: number): PedalSpan[] {
  const sorted = [...events].sort((a, b) => a.tick - b.tick || Number(a.down) - Number(b.down));
  const spans: PedalSpan[] = [];
  let downAt: number | null = null;
  for (const e of sorted) {
    if (e.down && downAt === null) downAt = e.tick;
    else if (!e.down && downAt !== null) {
      if (e.tick > downAt) spans.push({ startTick: downAt, endTick: e.tick });
      downAt = null;
    }
  }
  if (downAt !== null && endTick > downAt) spans.push({ startTick: downAt, endTick });
  return spans;
}

/** Abschnitte mehrerer Spuren vereinigen: echte Überlappungen verschmelzen, Pedalwechsel bleiben getrennt. */
export function mergePedalSpans(lists: readonly (readonly PedalSpan[])[]): PedalSpan[] {
  const all = lists.flat().sort((a, b) => a.startTick - b.startTick);
  const merged: PedalSpan[] = [];
  for (const s of all) {
    const last = merged[merged.length - 1];
    if (last && s.startTick < last.endTick) last.endTick = Math.max(last.endTick, s.endTick);
    else merged.push({ ...s });
  }
  return merged;
}

/** Abschnitte → Ereignisse (z. B. für den MIDI-Export) */
export function pedalEvents(spans: readonly PedalSpan[]): PedalEvent[] {
  return spans.flatMap((s) => [
    { tick: s.startTick, down: true },
    { tick: s.endTick, down: false },
  ]);
}
