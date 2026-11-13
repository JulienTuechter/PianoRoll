/**
 * Warteschlange für Bühnen-Effekte: Die Laufzeit meldet Anschläge (mit Wertung), die Bühne holt sie
 * einmal pro Frame ab. Begrenzt, damit ein verstecktes Tab nichts ansammelt.
 */
export interface RawFx {
  kind: 'press' | 'hit' | 'wrong';
  midi: number;
  velocity: number;
  /** 0..1 (Perfect = 1, Good = 0.7, Miss = 0.35) */
  strength: number;
  hand: 'left' | 'right';
}

const MAX = 256;
const queue: RawFx[] = [];

export function pushFx(e: RawFx): void {
  if (queue.length >= MAX) queue.shift();
  queue.push(e);
}

export function drainFx(): RawFx[] {
  return queue.splice(0);
}
