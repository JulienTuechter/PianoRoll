/**
 * Einstellungen der Bibliotheksseiten (SEO). Gelesen von scripts/library/* beim Build.
 * Die Stücke selbst stehen in public/library/catalog.json, die MIDI-Dateien in public/library/midi/.
 */
export interface LibraryConfig {
  /** Erlaubte Werte für license_class. Einträge ohne license_class gelten als erlaubt. */
  allowedLicenseClasses: string[];
  /** Unter so vielen Wörtern seitenspezifischem Text: robots noindex,follow und nicht in der Sitemap */
  minWords: number;
  /** Komponistenseite ab so vielen Stücken */
  composerMinPieces: number;
  /** Sammlungsseite ab so vielen Stücken mit gleichem collection-Wert */
  collectionMinPieces: number;
  /** Verwandte Stücke je Stückseite (3–5) */
  relatedPieces: number;
  /** „Neu in der Bibliothek“ auf der Startseite */
  latestOnHome: number;
  /** „Neu hinzugefügt“ auf der Übersicht */
  latestOnOverview: number;
  /** Einträge im Atom-Feed */
  feedSize: number;
  /** Mindestzahl interner Links je Stückseite (Check) */
  minInternalLinks: number;
  /** Maximale Klicktiefe ab der Startseite (Check) */
  maxClickDepth: number;
  /** Anzeigenamen der Stufen (level im Katalog). Nur Namen, keine Aussagen über Schwierigkeit. */
  levels: Record<number, { en: string; de: string }>;
  /** IndexNow (npm run seo:ping): standardmäßig aus. Die Key-Datei liegt unter public/<key>.txt. */
  indexNow: { enabled: boolean; key: string; endpoint: string };
}

const config: LibraryConfig = {
  allowedLicenseClasses: ['free'],
  minWords: 120,
  composerMinPieces: 3,
  collectionMinPieces: 2,
  relatedPieces: 5,
  latestOnHome: 6,
  latestOnOverview: 12,
  feedSize: 50,
  minInternalLinks: 10,
  maxClickDepth: 3,
  levels: {
    1: { en: 'First steps', de: 'Einstieg' },
    2: { en: 'Easy', de: 'Leicht' },
    3: { en: 'Intermediate', de: 'Mittel' },
    4: { en: 'Advanced', de: 'Fortgeschritten' },
  },
  indexNow: {
    enabled: false,
    key: '96cf718dd3bac10cda950ed62adb2ec2',
    endpoint: 'https://api.indexnow.org/indexnow',
  },
};

export default config;
