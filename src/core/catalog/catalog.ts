/**
 * Stückkatalog der App = die Online-Bibliothek: public/library/catalog.json (dieselbe Quelle wie die
 * Bibliotheksseiten unter /library/). Neue Stücke: siehe docs/ADDING_PIECES.md.
 * Gruppiert nach Stufe (level), innerhalb einer Stufe alphabetisch.
 */
import type { Locale } from '../../i18n/locale';

/** Die Felder aus catalog.json, die die App braucht */
export interface LibraryCatalogEntry {
  file: string;
  title: string;
  title_en?: string;
  title_de?: string;
  composer: string;
  composer_en?: string;
  composer_de?: string;
  level?: number;
  publish?: boolean;
}

export interface CatalogItem {
  /** Dateiname in public/library/midi/ – dient als ID */
  file: string;
  title: string;
  composer: string;
  level: number | null;
}

export interface CatalogGroup {
  /** null = ohne Stufe */
  level: number | null;
  items: CatalogItem[];
}

const todo = (v: unknown) => typeof v === 'string' && /\bTODO\b/.test(v);

/** Veröffentlichte, fertige Einträge → Gruppen je Stufe (aufsteigend, ohne Stufe zuletzt) */
export function buildCatalog(entries: readonly LibraryCatalogEntry[], locale: Locale): CatalogGroup[] {
  const items: CatalogItem[] = entries
    .filter((e) => e.file && e.publish !== false && !Object.values(e).some(todo))
    .map((e) => ({
      file: e.file,
      title: ((locale === 'de' ? e.title_de : e.title_en) ?? e.title).trim(),
      composer: ((locale === 'de' ? e.composer_de : e.composer_en) ?? e.composer).trim(),
      level: typeof e.level === 'number' ? e.level : null,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, locale));
  const levels = [...new Set(items.map((i) => i.level))].sort((a, b) =>
    a === null ? 1 : b === null ? -1 : a - b,
  );
  return levels.map((level) => ({ level, items: items.filter((i) => i.level === level) }));
}

/** Anzeigetitel in der Bibliothek, z. B. „Beethoven: Ode an die Freude“ */
export function catalogDisplayTitle(item: CatalogItem): string {
  const last = item.composer.split(/\s+/).pop() ?? item.composer;
  return `${last}: ${item.title}`;
}
