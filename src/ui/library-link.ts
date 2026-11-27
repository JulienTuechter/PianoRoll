/**
 * Öffnen eines Stücks der Online-Bibliothek per Link: /app/?piece=<slug>&lang=…
 * Slug → Datei aus library/slugs.json (wird erst bei Bedarf als eigener Chunk geladen),
 * Titel aus public/library/catalog.json, Noten aus public/library/midi/<datei> (wie der Katalog-Tab).
 */
import { buildCatalog, catalogDisplayTitle } from '../core/catalog/catalog';
import type { Locale } from '../i18n';
import { fetchCatalogBytes, loadLibraryCatalog } from './catalog';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Slug aus ?piece= (nur gültige Slugs) */
export function pieceFromUrl(search = typeof location === 'undefined' ? '' : location.search): string | null {
  const slug = new URLSearchParams(search).get('piece')?.trim().toLowerCase() ?? '';
  return SLUG.test(slug) ? slug : null;
}

/** ?piece= aus der Adresse entfernen (ohne neuen Verlaufseintrag), ?lang= bleibt */
export function clearPieceFromUrl(): void {
  if (typeof location === 'undefined') return;
  const url = new URL(location.href);
  if (!url.searchParams.has('piece')) return;
  url.searchParams.delete('piece');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

/** Lädt Titel und Bytes eines Bibliotheksstücks; null, wenn es den Slug nicht (mehr) gibt */
export async function fetchLibraryPiece(
  slug: string,
  locale: Locale,
): Promise<{ file: string; title: string; bytes: Uint8Array } | null> {
  const slugs = (await import('../../library/slugs.json')).default as Record<string, string>;
  const file = Object.keys(slugs).find((f) => slugs[f] === slug);
  if (!file) return null;
  // nur veröffentlichte Stücke (gleiche Regeln wie der Katalog-Tab)
  const item = buildCatalog(await loadLibraryCatalog(), locale)
    .flatMap((g) => g.items)
    .find((i) => i.file === file);
  if (!item) return null;
  return { file, title: catalogDisplayTitle(item), bytes: await fetchCatalogBytes(item) };
}
