/**
 * Texte der Bibliotheksseiten (scripts/library/). Englisch gibt die Struktur vor; de.json muss denselben Typ
 * erfüllen, npm run check:i18n vergleicht Keys und {Platzhalter}. Listen (z. B. piece.wait) sind
 * Textvarianten: Jede Seite wählt anhand ihres Slugs eine aus, damit sich die Seiten nicht gleichen.
 */
import en from './en.json';
import de from './de.json';
import type { Locale } from '../locale';

export type LibraryCopy = typeof en;

const copies: Record<Locale, LibraryCopy> = { en, de };

export function libraryCopy(locale: Locale): LibraryCopy {
  return copies[locale];
}
