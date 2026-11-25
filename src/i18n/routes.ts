/**
 * Routen der statischen Seiten je Sprache. Englisch liegt ohne Präfix unter / (x-default),
 * Deutsch unter /de/. Jeder Link, jedes hreflang und die Sitemap laufen über localizedPath().
 *
 * Konzept für später: Seiten wie die Bibliothek bekommen lokalisierte Slugs. Sie sind hier schon
 * beschrieben, existieren aber noch nicht – gebaut werden nur die Routen in BUILT_ROUTES.
 */
import type { Locale } from './locale';

/** Sprachen der statischen Seiten, Standardsprache zuerst */
export const PAGE_LOCALES = ['en', 'de'] as const satisfies readonly Locale[];
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_INFO: Record<Locale, { prefix: string; hreflang: string; ogLocale: string }> = {
  en: { prefix: '', hreflang: 'en', ogLocale: 'en_US' },
  de: { prefix: '/de', hreflang: 'de', ogLocale: 'de_DE' },
};

/** Pfad je Sprache (ohne Sprachpräfix), Parameter als :name */
export const ROUTES = {
  home: { en: '/', de: '/' },
  // noch nicht gebaut:
  library: { en: '/library/', de: '/bibliothek/' },
  composer: { en: '/library/composer/:composer/', de: '/bibliothek/komponist/:composer/' },
} as const satisfies Record<string, Record<Locale, string>>;

export type RouteName = keyof typeof ROUTES;

/** Routen, für die es heute eine Seite gibt (Build, Sitemap) */
export const BUILT_ROUTES: readonly RouteName[] = ['home'];

export type RouteParams = Record<string, string>;

/** localizedPath('composer', 'de', { composer: 'bach' }) → „/de/bibliothek/komponist/bach/“ */
export function localizedPath(route: RouteName, locale: Locale, params: RouteParams = {}): string {
  const path = ROUTES[route][locale].replace(/:(\w+)/g, (_, name: string) => {
    const value = params[name];
    if (!value) throw new Error(`localizedPath(${route}): Parameter „${name}“ fehlt`);
    return encodeURIComponent(value);
  });
  return LOCALE_INFO[locale].prefix + path;
}

/** Alle Sprachfassungen einer Route für hreflang und Sitemap, inklusive x-default (= Standardsprache) */
export function alternates(route: RouteName, params: RouteParams = {}): { hreflang: string; path: string }[] {
  return [
    ...PAGE_LOCALES.map((l) => ({
      hreflang: LOCALE_INFO[l].hreflang,
      path: localizedPath(route, l, params),
    })),
    { hreflang: 'x-default', path: localizedPath(route, DEFAULT_LOCALE, params) },
  ];
}

/** Die App liegt sprachneutral unter /app/; ?lang= übernimmt die Sprache der Seite, von der man kommt. */
export function appPath(locale: Locale): string {
  return `/app/?lang=${locale}`;
}

/** Sprache aus einem Seitenpfad (für Dev-Server und Tests) */
export function localeFromPath(pathname: string): Locale {
  return (
    PAGE_LOCALES.find((l) => l !== DEFAULT_LOCALE && pathname.startsWith(`${LOCALE_INFO[l].prefix}/`)) ??
    DEFAULT_LOCALE
  );
}
