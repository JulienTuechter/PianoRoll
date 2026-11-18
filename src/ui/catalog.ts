/**
 * Stückkatalog: Vite liest alle MIDI-Dateien aus catalog/ beim Build ein (nur die URLs, geladen wird erst beim Öffnen).
 * Neue Stücke: Datei in catalog/<Kategorie>/ ablegen – siehe catalog/README.md.
 */
import { buildCatalog, type CatalogGroup, type CatalogItem } from '../core/catalog/catalog';

const PREFIX = '../../catalog/';

const urls: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../../catalog/**/*.{mid,midi,MID,MIDI}', {
      query: '?url',
      import: 'default',
      eager: true,
    }),
  ).map(([k, url]) => [k.slice(PREFIX.length), url]),
);

export const catalog: CatalogGroup[] = buildCatalog(Object.keys(urls));

export async function fetchCatalogBytes(item: CatalogItem): Promise<Uint8Array> {
  const url = urls[item.path];
  if (!url) throw new Error(item.path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
