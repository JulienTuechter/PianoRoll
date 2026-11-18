import type { Messages } from '../i18n';

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Übungszeit: „45 s“, „12 min“ bzw. „2 h 05 min“ */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (ms < 60000) return `${Math.round(ms / 1000)} s`;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Stufe 0–5 einer Heatmap-Zelle (Fehler je Takt) relativ zum Maximum. */
export function heatLevel(errors: number, max: number): number {
  if (errors <= 0) return 0;
  const t = Math.min(1, errors / Math.max(1, max));
  return 1 + Math.min(4, Math.floor(t * 4.999));
}

/** Farbe einer Heatmap-Zelle; Hitzeskala von Ochsenblut (wenig) bis Weißglut (viel), auch über Helligkeit unterscheidbar. */
export function heatColor(errors: number, max: number): string {
  return `var(--heat-${heatLevel(errors, max)})`;
}

export const handsLabel = (t: Messages, h: 'both' | 'left' | 'right'): string =>
  h === 'both' ? t.hands.bothHands : h === 'left' ? t.common.leftHand : t.common.rightHand;
