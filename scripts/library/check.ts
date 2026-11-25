/**
 * Abnahme der gebauten Seiten (dist/): kleiner Crawler + SEO-Regeln. Liefert Fehlerliste (leer = ok).
 *   - Title (≤ 60 Zeichen, eindeutig je Sprache), Description (120–160, eindeutig), Canonical = eigene URL
 *   - hreflang gegenseitig, genau eine H1, jedes Bild mit alt, Stückseiten ≥ N interne Links
 *   - kein kaputter interner Link, jede Seite ≤ N Klicks von der Startseite, keine verwaisten Seiten
 *   - noindex genau dann, wenn zu wenig Text; Sitemap = alle indexierbaren Seiten; Feeds vorhanden
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import config from '../../library.config';
import { localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import { DESC_MAX, DESC_MIN, htmlText, TITLE_MAX, wordCount } from './text';
import type { LibraryPaths } from './types';

interface Page {
  path: string;
  html: string;
  lang: string;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  hreflang: Map<string, string>;
  h1: number;
  links: string[];
  assets: string[];
  imgsWithoutAlt: number;
  words: number;
  library: boolean;
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => {
  const v = new RegExp(`\\s${name}="([^"]*)"`, 'i').exec(tag)?.[1];
  return v === undefined ? undefined : decode(v);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function checkDist(
  paths: LibraryPaths,
  siteUrl: string,
): { errors: string[]; warnings: string[]; stats: Record<string, number> } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const dist = paths.dist;
  if (!existsSync(join(dist, 'index.html')))
    return { errors: [`${dist}/index.html fehlt – zuerst npm run build`], warnings, stats: {} };

  const libPrefixes = PAGE_LOCALES.map((l) => localizedPath('library', l));
  const isLibraryPath = (p: string) => libPrefixes.some((x) => p.startsWith(x));
  const files = walk(dist).map((f) => '/' + relative(dist, f).split(sep).join('/'));
  const fileSet = new Set(files);

  /** interner Pfad (ohne Query/Fragment) → existiert in dist? */
  const toInternal = (href: string): string | null => {
    if (siteUrl && href.startsWith(siteUrl)) href = href.slice(siteUrl.length) || '/';
    if (!href.startsWith('/') || href.startsWith('//')) return null;
    return href;
  };
  const resolves = (href: string): string | null => {
    const clean = decodeURI(href.split('#')[0]!.split('?')[0]!);
    if (clean.endsWith('/')) return fileSet.has(`${clean}index.html`) ? clean : null;
    if (fileSet.has(clean)) return clean;
    if (fileSet.has(`${clean}/index.html`)) return `${clean}/`;
    return null;
  };

  // ── Seiten einlesen ──
  const pages = new Map<string, Page>();
  for (const f of files) {
    if (!f.endsWith('/index.html')) continue;
    const path = f.slice(0, -'index.html'.length);
    const html = readFileSync(join(dist, f), 'utf8');
    const tags = (name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
    const metas = tags('meta');
    const linkTags = tags('link');
    const meta = (n: string) => metas.find((m) => attr(m, 'name') === n);
    const hreflang = new Map<string, string>();
    for (const t of linkTags)
      if (attr(t, 'rel') === 'alternate' && attr(t, 'hreflang'))
        hreflang.set(attr(t, 'hreflang')!, attr(t, 'href')!);
    const imgs = tags('img');
    const counted = [...html.matchAll(/<!--words-->([\s\S]*?)<!--\/words-->/g)].map((m) => m[1]).join(' ');
    pages.set(path, {
      path,
      html,
      lang: /<html[^>]*\slang="([^"]+)"/.exec(html)?.[1] ?? '',
      title: decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''),
      description: attr(meta('description') ?? '', 'content') ?? '',
      canonical: attr(linkTags.find((t) => attr(t, 'rel') === 'canonical') ?? '', 'href') ?? '',
      robots: attr(meta('robots') ?? '', 'content') ?? '',
      hreflang,
      h1: (html.match(/<h1[\s>]/g) ?? []).length,
      links: tags('a')
        .map((t) => attr(t, 'href'))
        .filter((h): h is string => !!h),
      assets: [
        ...imgs.map((t) => attr(t, 'src')),
        ...linkTags
          .filter((t) => /stylesheet|icon|alternate/.test(attr(t, 'rel') ?? ''))
          .map((t) => attr(t, 'href')),
      ].filter((h): h is string => !!h),
      // alt="" ist erlaubt (dekorative Bilder wie das Logo), fehlen darf das Attribut nicht
      imgsWithoutAlt: imgs.filter((t) => !/\salt="/.test(t)).length,
      words: wordCount(htmlText(counted)),
      library: isLibraryPath(path),
    });
  }
  const lib = [...pages.values()].filter((p) => p.library);
  const isPiece = (p: Page) => {
    const rest = libPrefixes.find((x) => p.path.startsWith(x)) ?? '';
    return /^[a-z0-9-]+\/$/.test(p.path.slice(rest.length));
  };
  if (!lib.length) errors.push('Keine Bibliotheksseiten in dist/ gefunden');

  // ── Kopf-Regeln (Bibliothek) ──
  const seenTitle = new Map<string, string>();
  const seenDesc = new Map<string, string>();
  for (const p of [...pages.values()].filter(
    (x) => x.library || x.path === '/' || /^\/[a-z]{2}\/$/.test(x.path),
  )) {
    const where = p.path;
    if (!p.title) errors.push(`${where}: <title> fehlt`);
    if (p.library && p.title.length > TITLE_MAX)
      errors.push(`${where}: Title ${p.title.length} Zeichen (> ${TITLE_MAX}): „${p.title}“`);
    if (!p.description) errors.push(`${where}: Meta Description fehlt`);
    if (p.library && (p.description.length < DESC_MIN || p.description.length > DESC_MAX))
      errors.push(`${where}: Description ${p.description.length} Zeichen (erwartet ${DESC_MIN}–${DESC_MAX})`);
    const tk = `${p.lang}|${p.title}`;
    if (seenTitle.has(tk)) errors.push(`Title doppelt: ${seenTitle.get(tk)} und ${where} („${p.title}“)`);
    seenTitle.set(tk, where);
    if (seenDesc.has(p.description))
      errors.push(`Description doppelt: ${seenDesc.get(p.description)} und ${where}`);
    seenDesc.set(p.description, where);
    if (!p.library) continue;
    if (p.canonical !== siteUrl + p.path) errors.push(`${where}: canonical „${p.canonical}“ ≠ eigene URL`);
    if (p.h1 !== 1) errors.push(`${where}: ${p.h1} × <h1> (erwartet genau 1)`);
    if (p.imgsWithoutAlt) errors.push(`${where}: ${p.imgsWithoutAlt} Bild(er) ohne alt-Text`);
    if (isPiece(p) && !/<img\s[^>]*alt="[^"]+"/.test(p.html))
      errors.push(`${where}: Stückseite ohne Bild mit alt`);
    // hreflang gegenseitig
    if (p.hreflang.size) {
      if (p.hreflang.get(p.lang) !== siteUrl + p.path)
        errors.push(`${where}: hreflang „${p.lang}“ zeigt nicht auf sich selbst`);
      for (const l of PAGE_LOCALES) if (!p.hreflang.has(l)) errors.push(`${where}: hreflang „${l}“ fehlt`);
      if (!p.hreflang.has('x-default')) errors.push(`${where}: hreflang x-default fehlt`);
      for (const [lang, href] of p.hreflang) {
        const target = pages.get(toInternal(href) ?? '');
        if (!target) errors.push(`${where}: hreflang ${lang} → ${href} existiert nicht`);
        else if (target.hreflang.get(p.lang) !== siteUrl + p.path)
          errors.push(`${where}: hreflang ${lang} → ${target.path} verweist nicht zurück`);
      }
    }
    // noindex genau dann, wenn zu wenig Text
    const noindex = /noindex/.test(p.robots);
    if (p.words < config.minWords && !noindex)
      errors.push(`${where}: nur ${p.words} Wörter, aber indexierbar`);
    if (p.words >= config.minWords && noindex) errors.push(`${where}: ${p.words} Wörter, aber noindex`);
    if (noindex && p.hreflang.size) errors.push(`${where}: noindex-Seite mit hreflang`);
    // interne Links
    if (isPiece(p)) {
      const targets = new Set(
        p.links
          .map(toInternal)
          .filter((h): h is string => !!h)
          .map((h) => h.split('#')[0]!)
          .filter((h) => h !== p.path),
      );
      if (targets.size < config.minInternalLinks)
        errors.push(`${where}: nur ${targets.size} interne Links (mindestens ${config.minInternalLinks})`);
    }
  }

  // ── Kaputte Links ──
  let checkedLinks = 0;
  for (const p of pages.values()) {
    for (const href of [...p.links, ...p.assets]) {
      const internal = toInternal(href);
      if (!internal) continue;
      checkedLinks++;
      if (!resolves(internal)) errors.push(`${p.path}: kaputter interner Link ${href}`);
    }
  }

  // ── Klicktiefe und verwaiste Seiten (Start: Startseite jeder Sprache) ──
  const depth = new Map<string, number>();
  const queue = PAGE_LOCALES.map((l) => localizedPath('home', l)).filter((h) => pages.has(h));
  for (const h of queue) depth.set(h, 0);
  const inbound = new Map<string, number>();
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i]!;
    for (const href of pages.get(from)!.links) {
      const internal = toInternal(href);
      const target = internal && resolves(internal);
      if (!target || !pages.has(target) || target === from) continue;
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
      if (!depth.has(target)) {
        depth.set(target, depth.get(from)! + 1);
        queue.push(target);
      }
    }
  }
  for (const p of lib) {
    const d = depth.get(p.path);
    if (d === undefined) errors.push(`${p.path}: von der Startseite aus nicht erreichbar (verwaist)`);
    else if (d > config.maxClickDepth)
      errors.push(`${p.path}: ${d} Klicks von der Startseite (max. ${config.maxClickDepth})`);
  }

  // ── Sitemaps ──
  const indexable = new Set(lib.filter((p) => !/noindex/.test(p.robots)).map((p) => p.path));
  if (!siteUrl) warnings.push('SITE_URL fehlt: keine Sitemaps, Sitemap-Prüfung übersprungen');
  else {
    const index = existsSync(join(dist, 'sitemap.xml'))
      ? readFileSync(join(dist, 'sitemap.xml'), 'utf8')
      : '';
    if (!index.includes('<sitemapindex')) errors.push('sitemap.xml ist kein Sitemap-Index');
    const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]!));
    const locs = new Set<string>();
    for (const child of children) {
      const file = toInternal(child);
      if (!file || !fileSet.has(file)) {
        errors.push(`sitemap.xml: Teil-Sitemap ${child} fehlt`);
        continue;
      }
      const xml = readFileSync(join(dist, file), 'utf8');
      for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) locs.add(toInternal(decode(m[1]!)) ?? m[1]!);
    }
    for (const path of indexable) if (!locs.has(path)) errors.push(`Sitemap: ${path} fehlt`);
    for (const path of locs) {
      const page = pages.get(path);
      if (!page) errors.push(`Sitemap: ${path} existiert nicht in dist/`);
      else if (/noindex/.test(page.robots)) errors.push(`Sitemap: ${path} ist noindex`);
    }
    const robotsTxt = existsSync(join(dist, 'robots.txt'))
      ? readFileSync(join(dist, 'robots.txt'), 'utf8')
      : '';
    if (!robotsTxt.includes(`Sitemap: ${siteUrl}/sitemap.xml`))
      errors.push('robots.txt verweist nicht auf sitemap.xml');
  }
  for (const l of PAGE_LOCALES) {
    const feed = localizedPath('libraryFeed', l);
    if (!fileSet.has(feed) || !readFileSync(join(dist, feed), 'utf8').includes('<feed'))
      errors.push(`${feed} fehlt oder ist kein Atom-Feed`);
  }

  return {
    errors,
    warnings,
    stats: {
      pages: pages.size,
      libraryPages: lib.length,
      indexable: indexable.size,
      links: checkedLinks,
      maxDepth: Math.max(0, ...lib.map((p) => depth.get(p.path) ?? 0)),
    },
  };
}
