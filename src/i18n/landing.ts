/**
 * Texte der statischen Seiten (Landingpage, 404). Einzige Quelle: en.json und de.json.
 * Englisch gibt die Struktur vor; de.json muss denselben Typ erfüllen (fehlende Keys = Compilerfehler,
 * npm run check:i18n prüft zusätzlich überzählige Keys und leere Texte).
 * Keys, die mit „//“ beginnen, sind Kommentare (z. B. „// REVIEW“) und werden nie angezeigt.
 */
import en from './en.json';
import de from './de.json';
import type { Locale } from './locale';

export type LandingCopy = typeof en;

const copies: Record<Locale, LandingCopy> = { en, de };

export function landingCopy(locale: Locale): LandingCopy {
  return copies[locale];
}

/** Platzhalter ersetzen: fmt('Takt {n} von {of}', { n: 2, of: 8 }) → „Takt 2 von 8“ */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
