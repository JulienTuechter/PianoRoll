/**
 * Stückkatalog der App: lädt public/library/catalog.json (einmal, bei Bedarf) – dieselben Stücke wie die
 * Bibliotheksseiten. Die MIDI-Datei wird erst beim Öffnen geholt.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  buildCatalog,
  type CatalogGroup,
  type CatalogItem,
  type LibraryCatalogEntry,
} from '../core/catalog/catalog';
import { getLocale, subscribeLocale } from '../i18n';

export const LIBRARY_BASE = '/library/';

let pending: Promise<LibraryCatalogEntry[]> | null = null;

/** catalog.json der Online-Bibliothek; bei Fehlern leer (und beim nächsten Aufruf neuer Versuch) */
export function loadLibraryCatalog(): Promise<LibraryCatalogEntry[]> {
  pending ??= fetch(`${LIBRARY_BASE}catalog.json`)
    .then((res) => (res.ok ? (res.json() as Promise<LibraryCatalogEntry[]>) : []))
    .then((data) => (Array.isArray(data) ? data : []))
    .catch(() => {
      pending = null;
      return [];
    });
  return pending;
}

/** Katalog in der aktuellen Sprache; null, solange er lädt */
export function useCatalog(): CatalogGroup[] | null {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  const [entries, setEntries] = useState<LibraryCatalogEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLibraryCatalog().then((e) => alive && setEntries(e));
    return () => {
      alive = false;
    };
  }, []);
  return entries ? buildCatalog(entries, locale) : null;
}

export async function fetchCatalogBytes(item: Pick<CatalogItem, 'file'>): Promise<Uint8Array> {
  const res = await fetch(`${LIBRARY_BASE}midi/${encodeURIComponent(item.file)}`);
  if (!res.ok) throw new Error(`${item.file}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
