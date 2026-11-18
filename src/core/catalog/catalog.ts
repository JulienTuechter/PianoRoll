/**
 * Stückkatalog: mitgelieferte MIDI-Dateien aus dem Ordner catalog/ (siehe catalog/README.md).
 *
 * Konvention, damit neue Stücke ohne Code-Änderung erscheinen:
 *   catalog/<Kategorie>/<Komponist> - <Titel>.mid
 * Eine Zahl vor Ordner- oder Dateinamen („01 Einstieg“, „02_...“) legt nur die Reihenfolge fest und wird
 * nicht angezeigt. Dateien direkt in catalog/ landen in der Kategorie ohne Namen.
 */

export interface CatalogItem {
  /** Pfad relativ zu catalog/, z. B. „01 Einstieg/Volkslied - Alle meine Entchen.mid“ – dient als ID */
  path: string;
  category: string;
  composer: string | null;
  title: string;
  /** Sortierschlüssel aus Ordner- und Dateiname (mit Nummern) */
  sortKey: string;
}

export interface CatalogGroup {
  category: string;
  items: CatalogItem[];
}

const ORDER_PREFIX = /^\d+[\s._-]+/;

export function stripOrder(name: string): string {
  return name.replace(ORDER_PREFIX, '').trim();
}

/** Liest Kategorie, Komponist und Titel aus dem Pfad; liefert null für Nicht-MIDI-Dateien. */
export function parseCatalogPath(path: string): CatalogItem | null {
  const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = clean.split('/');
  const file = parts.pop() ?? '';
  if (!/\.midi?$/i.test(file)) return null;
  const base = stripOrder(file.replace(/\.midi?$/i, '').replace(/_/g, ' '));
  // Trenner zwischen Komponist und Titel: „ - “ oder „ – “ (Halbgeviertstrich)
  const m = /^(.+?)\s+[-–]\s+(.+)$/.exec(base);
  return {
    path: clean,
    category: parts.map(stripOrder).join(' / '),
    composer: m ? m[1]!.trim() : null,
    title: (m ? m[2]! : base).trim(),
    sortKey: clean.toLocaleLowerCase('de'),
  };
}

/** Gruppiert nach Kategorie; Reihenfolge nach Ordner- und Dateinamen (numerisch, also „2“ vor „10“). */
export function buildCatalog(paths: readonly string[]): CatalogGroup[] {
  const items = paths
    .map(parseCatalogPath)
    .filter((x): x is CatalogItem => x !== null)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de', { numeric: true }));
  const groups: CatalogGroup[] = [];
  for (const item of items) {
    const g = groups.at(-1);
    if (g && g.category === item.category) g.items.push(item);
    else groups.push({ category: item.category, items: [item] });
  }
  return groups;
}

/** Anzeigetitel in der Bibliothek, z. B. „Beethoven: Ode an die Freude“ */
export function catalogDisplayTitle(item: CatalogItem): string {
  return item.composer ? `${item.composer}: ${item.title}` : item.title;
}
