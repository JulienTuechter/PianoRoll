/**
 * Erzeugt die Bibliotheksseiten in dist/ (läuft in postbuild nach vite build und scripts/build-pages.ts):
 *   dist/library/…, dist/de/bibliothek/… (HTML), Piano-Roll-SVG/PNG, Atom-Feeds,
 *   sitemap.xml (Index) + sitemap-pages.xml + sitemap-library-{en,de}.xml, robots.txt
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Locale } from '../../src/i18n/locale';
import { localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import { loadLibrary, type Library } from './catalog';
import {
  atomFeed,
  robots,
  sitemapIndex,
  librarySitemap,
  sitemapLibrary,
  sitemapPages,
  SITEMAP_PAGES,
} from './outputs';
import { rollPng, rollSvg } from './roll';
import { buildPages, footerHtml, layout, type ContentLookup, type PageKind, type SitePage } from './site';
import type { LibraryPaths } from './types';

export const CSS_SOURCE = 'public/library/library.css';

export interface Summary {
  pages: Record<PageKind, Record<Locale, number>>;
  noindex: { path: string; words: number }[];
  pieces: number;
  files: number;
  ms: number;
  newSlugs: string[];
  warnings: string[];
}

/** content/<kind>/<slug>.<locale>.md einmal einlesen */
function contentLookup(paths: LibraryPaths): ContentLookup {
  const cache = new Map<string, string>();
  for (const kind of ['pieces', 'composers'] as const) {
    const dir = join(paths.content, kind);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      const m = /^(.+)\.(en|de)\.md$/.exec(f);
      if (m) cache.set(`${kind}/${m[1]}.${m[2]}`, readFileSync(join(dir, f), 'utf8'));
    }
  }
  return (kind, slug, locale) => cache.get(`${kind}/${slug}.${locale}`)?.trim() || null;
}

export async function generate(paths: LibraryPaths, siteUrl: string, lib?: Library): Promise<Summary> {
  const t0 = performance.now();
  const library = lib ?? (await loadLibrary(paths, { writeSlugs: true }));
  const { pieces } = library;
  const { pages, groups } = buildPages(pieces, contentLookup(paths));

  const byId = new Map<string, Map<Locale, SitePage>>();
  for (const p of pages) byId.set(p.id, (byId.get(p.id) ?? new Map<Locale, SitePage>()).set(p.locale, p));

  const css = readFileSync(join(paths.root, CSS_SOURCE));
  const cssHref = `/library/library.css?v=${createHash('sha256').update(css).digest('hex').slice(0, 10)}`;
  const footer = Object.fromEntries(PAGE_LOCALES.map((l) => [l, footerHtml(groups, l)])) as Record<
    Locale,
    string
  >;
  const ctx = { siteUrl, cssHref, byId, footer };

  const jobs: [string, string | Buffer][] = [];
  for (const page of pages) jobs.push([join(page.path, 'index.html'), layout(page, ctx)]);
  for (const p of pieces) {
    const dir = localizedPath('piece', 'en', { slug: p.slug });
    jobs.push([join(dir, 'piano-roll.svg'), rollSvg(p.roll, `${p.titles.en} – ${p.composer}`)]);
    jobs.push([join(dir, 'og.png'), rollPng(p.roll)]);
  }
  for (const l of PAGE_LOCALES) {
    const pieceById = new Map([...byId].map(([id, v]) => [id, v.get(l)!]));
    jobs.push([localizedPath('libraryFeed', l), atomFeed(pieces, pieceById, l, siteUrl)]);
  }
  jobs.push(['robots.txt', robots(siteUrl)]);
  if (siteUrl) {
    const today = new Date().toISOString().slice(0, 10);
    const lastmods: Record<string, string> = { [SITEMAP_PAGES]: today };
    jobs.push([SITEMAP_PAGES, sitemapPages(siteUrl, today)]);
    for (const l of PAGE_LOCALES) {
      jobs.push([sitemapLibrary(l), librarySitemap(pages, l, siteUrl, byId)]);
      lastmods[sitemapLibrary(l)] = pages
        .filter((p) => p.locale === l && p.indexable)
        .reduce((m, p) => (p.lastmod > m ? p.lastmod : m), '1970-01-01');
    }
    jobs.push(['sitemap.xml', sitemapIndex(siteUrl, lastmods)]);
  }

  const dirs = new Set(jobs.map(([f]) => dirname(join(paths.dist, f))));
  await Promise.all([...dirs].map((d) => mkdir(d, { recursive: true })));
  for (let i = 0; i < jobs.length; i += 64)
    await Promise.all(jobs.slice(i, i + 64).map(([f, data]) => writeFile(join(paths.dist, f), data)));

  const count = () => Object.fromEntries(PAGE_LOCALES.map((l) => [l, 0])) as Record<Locale, number>;
  const summary: Summary = {
    pages: { overview: count(), piece: count(), composer: count(), collection: count(), level: count() },
    noindex: pages.filter((p) => !p.indexable).map((p) => ({ path: p.path, words: p.words })),
    pieces: pieces.length,
    files: jobs.length,
    ms: Math.round(performance.now() - t0),
    newSlugs: library.newSlugs,
    warnings: library.warnings,
  };
  for (const p of pages) summary.pages[p.kind][p.locale]++;
  return summary;
}
