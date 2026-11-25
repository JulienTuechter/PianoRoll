/**
 * Katalog lesen, prüfen und zu Stücken mit Slug und Eckdaten aufbereiten.
 * Abbruch (LibraryError) bei: Pflichtfeld fehlt, TODO, Lizenz nicht erlaubt, Datei fehlt/kaputt.
 */
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import config from '../../library.config';
import { analyzeMidi, applyOverrides } from './analyze';
import { assignSlugs, composerLastName, redirectProblems, slugify, slugProblems } from './slug';
import {
  ENTRY_FIELDS,
  LibraryError,
  type CatalogEntry,
  type LibraryPaths,
  type Piece,
  type PieceStats,
  type RollNote,
} from './types';

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T;
  } catch (err) {
    throw new LibraryError([`${file}: kein gültiges JSON (${(err as Error).message})`]);
  }
}

export async function writeJson(file: string, data: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

/** Sortiert nach Schlüssel, damit Diffs von slugs.json/redirects.json ruhig bleiben */
export const sortedObject = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

export async function readCatalog(paths: LibraryPaths): Promise<CatalogEntry[]> {
  const data = await readJson<unknown>(paths.catalog, []);
  const list = Array.isArray(data) ? data : (data as { pieces?: unknown }).pieces;
  if (!Array.isArray(list))
    throw new LibraryError([`${paths.catalog}: erwartet ein Array von Einträgen (oder { "pieces": [...] })`]);
  return list as CatalogEntry[];
}

const isTodo = (v: unknown): boolean =>
  typeof v === 'string' ? /\bTODO\b/.test(v) : Array.isArray(v) ? v.some(isTodo) : false;

export const isPublished = (e: CatalogEntry) => e.publish !== false;

/** Name eines Eintrags für Fehlermeldungen */
export const entryName = (e: Partial<CatalogEntry>) =>
  e.title && !isTodo(e.title) ? `„${e.title}“ (${e.file ?? '?'})` : `${e.file ?? 'Eintrag ohne file'}`;

/** Prüft die Felder eines Eintrags (ohne MIDI-Datei) */
export function entryProblems(e: CatalogEntry): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = entryName(e);
  const err = (reason: string) => errors.push(`${name}: ${reason}`);
  const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;

  if (!str(e.file)) err('Pflichtfeld „file“ fehlt');
  else if (!/\.midi?$/i.test(e.file) || basename(e.file) !== e.file)
    err(`„file“ muss ein Dateiname in public/library/midi/ sein (.mid), nicht „${e.file}“`);
  if (!isPublished(e)) return { errors, warnings };

  for (const f of ['title', 'composer', 'license'] as const) if (!str(e[f])) err(`Pflichtfeld „${f}“ fehlt`);
  if (!str(e.license_url) && !str(e.credit)) err('„license_url“ oder „credit“ fehlt');
  for (const [k, v] of Object.entries(e)) if (isTodo(v)) err(`„${k}“ enthält noch TODO`);
  if (e.license_url !== undefined && !/^https?:\/\//.test(e.license_url))
    err(`„license_url“ ist keine http(s)-Adresse`);
  if (e.license_class !== undefined && !config.allowedLicenseClasses.includes(e.license_class))
    err(
      `Lizenz nicht freigegeben: license_class „${e.license_class}“ ist in library.config.ts nicht erlaubt ` +
        `(erlaubt: ${config.allowedLicenseClasses.join(', ')})`,
    );
  if (e.added !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(e.added) || Number.isNaN(Date.parse(e.added))))
    err(`„added“ muss ein Datum im Format JJJJ-MM-TT sein, nicht „${e.added}“`);
  if (e.level !== undefined && !(Number.isInteger(e.level) && e.level >= 1))
    err(`„level“ muss eine ganze Zahl ≥ 1 sein`);
  if (e.aliases !== undefined && !(Array.isArray(e.aliases) && e.aliases.every(str)))
    err('„aliases“ muss eine Liste von Texten sein');
  if (e.hands !== undefined && !['both', 'right', 'left'].includes(e.hands))
    err('„hands“ muss „both“, „right“ oder „left“ sein');
  for (const k of Object.keys(e))
    if (!(ENTRY_FIELDS as readonly string[]).includes(k) && !k.startsWith('//'))
      warnings.push(`${name}: unbekanntes Feld „${k}“ wird ignoriert`);
  return { errors, warnings };
}

export interface Library {
  pieces: Piece[];
  /** alle Einträge (auch publish: false) */
  entries: CatalogEntry[];
  slugs: Record<string, string>;
  redirects: Record<string, string>;
  /** Dateien, die in diesem Lauf einen neuen Slug bekommen haben */
  newSlugs: string[];
  warnings: string[];
}

export interface LoadOptions {
  /** neue Slugs in library/slugs.json schreiben (Build: ja; Check: nein) */
  writeSlugs: boolean;
}

/** Katalog → geprüfte Stücke. Wirft LibraryError mit allen gefundenen Problemen. */
export async function loadLibrary(paths: LibraryPaths, opts: LoadOptions): Promise<Library> {
  const entries = await readCatalog(paths);
  const errors: string[] = [];
  const warnings: string[] = [];

  const files = new Set<string>();
  for (const e of entries) {
    const p = entryProblems(e);
    errors.push(...p.errors);
    warnings.push(...p.warnings);
    if (e.file) {
      if (files.has(e.file)) errors.push(`${entryName(e)}: Datei steht mehrfach im Katalog`);
      files.add(e.file);
    }
  }

  const published = entries.filter(isPublished);
  const existingSlugs = await readJson<Record<string, string>>(paths.slugs, {});
  const redirects = await readJson<Record<string, string>>(paths.redirects, {});
  const { slugs, created } = assignSlugs(
    published.filter((e) => e.file && e.title && e.composer),
    existingSlugs,
    redirects,
  );
  errors.push(...slugProblems(slugs));
  const active = new Set(published.map((e) => slugs[e.file]).filter((s): s is string => !!s));
  errors.push(...redirectProblems(redirects, active));

  // MIDI-Dateien lesen und analysieren (auch für publish: false – „alle .mid-Dateien vorhanden und lesbar“)
  const analyzed = new Map<string, { stats: PieceStats; roll: RollNote[]; mtime: Date; bytes: number }>();
  await Promise.all(
    entries.map(async (e) => {
      if (!e.file) return;
      const file = join(paths.midiDir, e.file);
      try {
        const [bytes, st] = await Promise.all([readFile(file), stat(file)]);
        analyzed.set(e.file, { ...analyzeMidi(new Uint8Array(bytes)), mtime: st.mtime, bytes: bytes.length });
      } catch (err) {
        const reason =
          (err as NodeJS.ErrnoException).code === 'ENOENT'
            ? `MIDI-Datei fehlt (public/library/midi/${e.file})`
            : `MIDI-Datei nicht lesbar: ${(err as Error).message}`;
        errors.push(`${entryName(e)}: ${reason}`);
      }
    }),
  );

  if (errors.length) throw new LibraryError(errors);

  // Komponisten-Slugs: Nachname, bei gleichem Nachnamen verschiedener Komponisten der volle Name
  const byLast = new Map<string, Set<string>>();
  for (const e of published) {
    const key = slugify(composerLastName(e.composer));
    byLast.set(key, (byLast.get(key) ?? new Set()).add(e.composer.trim()));
  }
  const composerSlug = (c: string) => {
    const last = slugify(composerLastName(c));
    return (byLast.get(last)?.size ?? 0) > 1 ? slugify(c) : last;
  };

  const pieces: Piece[] = [];
  for (const e of published) {
    const a = analyzed.get(e.file)!;
    const { stats, problems } = applyOverrides(a.stats, e);
    errors.push(...problems.map((p) => `${entryName(e)}: ${p}`));
    const added = e.added ?? a.mtime.toISOString().slice(0, 10);
    const composer = e.composer.trim();
    pieces.push({
      entry: e,
      slug: slugs[e.file]!,
      titles: { en: (e.title_en ?? e.title).trim(), de: (e.title_de ?? e.title).trim() },
      composer,
      composerShort: composerLastName(composer),
      composerSlug: composerSlug(composer),
      collection: e.collection?.trim() || null,
      collectionSlug: e.collection?.trim() ? slugify(e.collection) : null,
      level: e.level ?? null,
      aliases: (e.aliases ?? []).map((s) => s.trim()).filter(Boolean),
      added,
      lastmod: added,
      stats,
      roll: a.roll,
      fileBytes: a.bytes,
    });
  }
  if (errors.length) throw new LibraryError(errors);

  // Neueste zuerst, dann alphabetisch: feste Reihenfolge für Übersicht, Feed und Startseite
  pieces.sort((a, b) => b.added.localeCompare(a.added) || a.titles.en.localeCompare(b.titles.en));

  // Slugs nur für Dateien behalten, die noch im Katalog stehen? Nein: alte Zuordnungen bleiben,
  // damit ein Stück nach publish:false → true seinen Slug behält.
  if (opts.writeSlugs && created.length) await writeJson(paths.slugs, sortedObject(slugs));
  return { pieces, entries, slugs, redirects, newSlugs: created, warnings };
}
