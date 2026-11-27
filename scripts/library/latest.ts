/**
 * Die neuesten Stücke für „Neu in der Bibliothek“ auf der Startseite. Bewusst leichtgewichtig
 * (nur catalog.json + slugs.json, keine MIDI-Analyse), damit Landing-Build und Dev-Server es billig laden.
 * Vollständig geprüft wird der Katalog vor dem Build (prebuild) und danach (postbuild).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import config from '../../library.config.ts';
import type { Locale } from '../../src/i18n/locale';
import { localizedPath } from '../../src/i18n/routes.ts';
import { libraryPaths, type CatalogEntry } from './types.ts';

export interface LatestPiece {
  title: string;
  composer: string;
  path: string;
}

const todo = (v: unknown) => typeof v === 'string' && /\bTODO\b/.test(v);

export function latestPieces(root: string, locale: Locale, n = config.latestOnHome): LatestPiece[] {
  const paths = libraryPaths(root);
  if (!existsSync(paths.catalog) || !existsSync(paths.slugs)) return [];
  const raw = JSON.parse(readFileSync(paths.catalog, 'utf8')) as CatalogEntry[] | { pieces: CatalogEntry[] };
  const entries = Array.isArray(raw) ? raw : raw.pieces;
  const slugs = JSON.parse(readFileSync(paths.slugs, 'utf8')) as Record<string, string>;
  const added = (e: CatalogEntry) => {
    if (e.added) return e.added;
    const file = join(paths.midiDir, e.file);
    return existsSync(file) ? statSync(file).mtime.toISOString().slice(0, 10) : '';
  };
  return entries
    .filter((e) => e.publish !== false && slugs[e.file] && !Object.values(e).some(todo))
    .map((e) => ({ e, added: added(e), title: (locale === 'de' ? e.title_de : e.title_en) ?? e.title }))
    .sort(
      (a, b) =>
        b.added.localeCompare(a.added) ||
        (a.e.title_en ?? a.e.title).localeCompare(b.e.title_en ?? b.e.title),
    )
    .slice(0, n)
    .map(({ e, title }) => ({
      title,
      composer: (locale === 'de' ? e.composer_de : e.composer_en) ?? e.composer,
      path: localizedPath('piece', locale, { slug: slugs[e.file]! }),
    }));
}
