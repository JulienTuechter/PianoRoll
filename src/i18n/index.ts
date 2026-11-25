/**
 * Mehrsprachigkeit ohne Framework-Abhängigkeit: funktioniert in React-Komponenten (über useT in
 * src/ui/i18n.ts), in der Laufzeit und in Canvas-Renderern.
 *
 * Deutsch ist die Quelle (locales/de.ts); jede weitere Sprache muss denselben Typ erfüllen, ein fehlender
 * Text ist also ein Compilerfehler. Texte mit Werten sind Funktionen: t().measure(3) → „Takt 3“.
 */
import { de, type Messages } from './locales/de';
import { en } from './locales/en';

import type { Locale } from './locale';

export type { Messages, Locale };
export type LocalePref = Locale | 'auto';

export const LOCALES: readonly Locale[] = ['de', 'en'];
const catalogs: Record<Locale, Messages> = { de, en };

/**
 * Automatische Sprache: zuerst ?lang= aus der Adresse (Links der Landingpage: /de/ → /app/?lang=de),
 * dann die Browsersprache (Deutsch für jede „de-*“-Variante), sonst Englisch.
 */
export function detectLocale(): Locale {
  const fromUrl = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('lang');
  if (fromUrl === 'de' || fromUrl === 'en') return fromUrl;
  const langs =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const l of langs) {
    const base = l?.toLowerCase().split('-')[0];
    if (base === 'de' || base === 'en') return base;
  }
  return 'en';
}

export function resolveLocale(pref: LocalePref): Locale {
  return pref === 'auto' ? detectLocale() : pref;
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (locale === current) return;
  current = locale;
  for (const fn of listeners) fn();
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Texte der aktuellen Sprache, für Code außerhalb von React. In Komponenten useT() verwenden. */
export function t(): Messages {
  return catalogs[current];
}

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale];
}
