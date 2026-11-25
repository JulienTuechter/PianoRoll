/**
 * library/redirects.json (alter Slug → neuer Slug) als 301-Weiterleitungen in vercel.json.
 * Vercel liest vercel.json vor dem Build – die Datei muss also committet sein. Andere Einträge
 * (Weiterleitungen außerhalb der Bibliothek, sonstige Einstellungen) bleiben unangetastet.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import { flattenRedirects } from './slug';
import type { LibraryPaths } from './types';

interface VercelRedirect {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
}

const LIBRARY_PREFIXES = PAGE_LOCALES.map((l) => localizedPath('library', l));
const isLibrary = (r: VercelRedirect) => LIBRARY_PREFIXES.some((p) => r.source.startsWith(p));

export function libraryRedirects(redirects: Readonly<Record<string, string>>): VercelRedirect[] {
  const flat = flattenRedirects(redirects);
  return Object.keys(flat)
    .sort()
    .flatMap((from) =>
      PAGE_LOCALES.flatMap((l) => {
        const src = localizedPath('piece', l, { slug: from });
        const destination = localizedPath('piece', l, { slug: flat[from]! });
        // mit und ohne Schrägstrich am Ende
        return [
          { source: src, destination, permanent: true },
          { source: src.replace(/\/$/, ''), destination, permanent: true },
        ];
      }),
    );
}

/** vercel.json abgleichen. write=false: nur prüfen. Rückgabe: true, wenn die Datei (noch) abweicht. */
export async function syncVercel(
  paths: LibraryPaths,
  redirects: Readonly<Record<string, string>>,
  write: boolean,
): Promise<boolean> {
  const wanted = libraryRedirects(redirects);
  const exists = existsSync(paths.vercel);
  if (!exists && wanted.length === 0) return false;
  const raw = exists ? await readFile(paths.vercel, 'utf8') : '{}';
  const json = JSON.parse(raw) as { redirects?: VercelRedirect[] } & Record<string, unknown>;
  const others = (json.redirects ?? []).filter((r) => !isLibrary(r));
  const next = { ...json, redirects: [...others, ...wanted] };
  if (!next.redirects.length) delete (next as { redirects?: unknown }).redirects;
  if (JSON.stringify(next) === JSON.stringify(json)) return false;
  if (write) await writeFile(paths.vercel, JSON.stringify(next, null, 2) + '\n');
  return true;
}
