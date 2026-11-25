/** Sitemap-Index, Teil-Sitemaps, Atom-Feeds und robots.txt */
import { libraryCopy } from '../../src/i18n/library';
import type { Locale } from '../../src/i18n/locale';
import { alternates, BUILT_ROUTES, localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import config from '../../library.config';
import { esc } from './text';
import { piecePath, type SitePage } from './site';
import type { Piece } from './types';

export const SITEMAP_PAGES = 'sitemap-pages.xml';
export const sitemapLibrary = (l: Locale) => `sitemap-library-${l}.xml`;

const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
const URLSET =
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

function urlEntry(loc: string, lastmod: string, alts: { hreflang: string; href: string }[]): string {
  const links = alts
    .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}" />`)
    .join('');
  return `  <url>\n    <loc>${esc(loc)}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}${links}\n  </url>`;
}

/** Startseite(n) und App */
export function sitemapPages(siteUrl: string, today: string): string {
  const urls = BUILT_ROUTES.flatMap((route) =>
    PAGE_LOCALES.map((l) =>
      urlEntry(
        siteUrl + localizedPath(route, l),
        today,
        alternates(route).map((a) => ({ hreflang: a.hreflang, href: siteUrl + a.path })),
      ),
    ),
  );
  // Die App ist sprachneutral (eine URL) und hat daher keine Alternativen
  urls.push(urlEntry(`${siteUrl}/app/`, today, []));
  return XML + URLSET + urls.join('\n') + '\n</urlset>\n';
}

/** Alle indexierbaren Bibliotheksseiten einer Sprache */
export function librarySitemap(
  pages: readonly SitePage[],
  locale: Locale,
  siteUrl: string,
  byId: Map<string, Map<Locale, SitePage>>,
): string {
  const urls = pages
    .filter((p) => p.locale === locale && p.indexable)
    .map((p) => {
      const versions = byId.get(p.id)!;
      const alts = p.hreflang
        ? [
            ...PAGE_LOCALES.map((l) => ({ hreflang: l, href: siteUrl + versions.get(l)!.path })),
            { hreflang: 'x-default', href: siteUrl + versions.get(PAGE_LOCALES[0])!.path },
          ]
        : [];
      return urlEntry(siteUrl + p.path, p.lastmod, alts);
    });
  return XML + URLSET + urls.join('\n') + '\n</urlset>\n';
}

export function sitemapIndex(siteUrl: string, lastmods: Record<string, string>): string {
  const items = Object.entries(lastmods)
    .map(
      ([file, lastmod]) =>
        `  <sitemap>\n    <loc>${esc(`${siteUrl}/${file}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>`,
    )
    .join('\n');
  return (
    XML +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    items +
    '\n</sitemapindex>\n'
  );
}

export function robots(siteUrl: string): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (siteUrl) lines.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

/** Atom-Feed der neuesten Stücke (pieces ist nach added absteigend sortiert) */
export function atomFeed(
  pieces: readonly Piece[],
  pages: Map<string, SitePage>,
  locale: Locale,
  siteUrl: string,
): string {
  const c = libraryCopy(locale);
  const items = pieces.slice(0, config.feedSize);
  const feedPath = localizedPath('libraryFeed', locale);
  const libPath = localizedPath('library', locale);
  const updated = `${items[0]?.added ?? '1970-01-01'}T00:00:00Z`;
  const entries = items
    .map((p) => {
      const page = pages.get(`piece:${p.slug}`);
      const href = siteUrl + piecePath(p, locale);
      return `  <entry>
    <title>${esc(`${p.titles[locale]} – ${p.composer}`)}</title>
    <link rel="alternate" type="text/html" hreflang="${locale}" href="${esc(href)}" />
    <id>tag:pianist,${p.added}:library/${p.slug}</id>
    <published>${p.added}T00:00:00Z</published>
    <updated>${p.lastmod}T00:00:00Z</updated>
    <author><name>${esc(p.composer)}</name></author>
    <summary>${esc(page?.description ?? '')}</summary>
  </entry>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${locale}">
  <title>${esc(c.feed.title)}</title>
  <subtitle>${esc(c.feed.subtitle)}</subtitle>
  <id>tag:pianist,2026:library/${locale}</id>
  <link rel="self" type="application/atom+xml" href="${esc(siteUrl + feedPath)}" />
  <link rel="alternate" type="text/html" href="${esc(siteUrl + libPath)}" />
  <updated>${updated}</updated>
${entries}
</feed>
`;
}
