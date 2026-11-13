import { computeKeyboardLayout, type KeyboardLayout } from './keyboard-layout';

/** Beide Canvas teilen dieselbe Breite; Layout nur bei Breitenänderung neu berechnen. */
let cached: KeyboardLayout | null = null;

export function layoutForWidth(width: number): KeyboardLayout {
  if (!cached || cached.width !== width) cached = computeKeyboardLayout(width);
  return cached;
}
