/**
 * Statische Seiten aus dem gemeinsamen Template und den i18n-Dateien. Wird über Vites SSR-Loader geladen
 * (scripts/build-pages.ts beim Build, vite.config.ts im Dev-Server), damit die Landing-Komponenten
 * genauso aufgelöst werden wie im Browser.
 */
import type { Locale } from '../../src/i18n/locale';
import { landingCopy } from '../../src/i18n/landing';
import {
  alternates,
  BUILT_ROUTES,
  DEFAULT_LOCALE,
  LOCALE_INFO,
  localizedPath,
  PAGE_LOCALES,
  type RouteName,
} from '../../src/i18n/routes';
import { renderBody } from '../../landing/src/entry-server';
import type { PageRenderer, SiteEnv } from './types';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON sicher in <script> einbetten */
const jsonScript = (data: unknown) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

function pageHead(route: RouteName, locale: Locale, env: SiteEnv): string {
  const c = landingCopy(locale);
  const abs = (path: string) => env.siteUrl + path;
  const url = abs(localizedPath(route, locale));
  const image = abs('/og-image.png');
  const others = PAGE_LOCALES.filter((l) => l !== locale);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Pianist',
    url,
    image,
    description: c.meta.description,
    inLanguage: locale,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Web MIDI (Chrome, Edge, Firefox, Brave)',
    isAccessibleForFree: true,
    ...(env.githubUrl ? { sameAs: [env.githubUrl] } : {}),
    keywords: c.meta.keywords,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };
  return [
    `<title>${esc(c.meta.title)}</title>`,
    `<meta name="description" content="${esc(c.meta.description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    ...alternates(route).map(
      (a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(abs(a.path))}" />`,
    ),
    '',
    '<!-- Link-Vorschau (Open Graph, X/Twitter, Mastodon) -->',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Pianist" />`,
    `<meta property="og:title" content="${esc(c.meta.title)}" />`,
    `<meta property="og:description" content="${esc(c.meta.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(c.meta.ogImageAlt)}" />`,
    `<meta property="og:locale" content="${LOCALE_INFO[locale].ogLocale}" />`,
    ...others.map((l) => `<meta property="og:locale:alternate" content="${LOCALE_INFO[l].ogLocale}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(c.meta.title)}" />`,
    `<meta name="twitter:description" content="${esc(c.meta.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(c.meta.ogImageAlt)}" />`,
    '',
    '<!-- Strukturierte Daten -->',
    `<script type="application/ld+json">\n${jsonScript(jsonLd)}\n</script>`,
  ].join('\n    ');
}

const HEAD = '<!--page-head-->';
const BODY = '<!--page-body-->';

/** Eine Sprachfassung einer Seite: Template (von Vite verarbeitet) + Head + vorgerenderter Inhalt */
function renderPage(template: string, route: RouteName, locale: Locale, env: SiteEnv): string {
  for (const marker of [HEAD, BODY, '{{lang}}'])
    if (!template.includes(marker)) throw new Error(`Template ohne ${marker} – zuerst vite build ausführen`);
  if (route !== 'home') throw new Error(`Für die Route „${route}“ gibt es noch kein Template`);
  return template
    .replace('{{lang}}', locale)
    .replace(HEAD, pageHead(route, locale, env))
    .replace(BODY, renderBody(locale));
}

/** Gemeinsame 404-Seite für alle Sprachen: jede Sprache als eigener Abschnitt mit lang-Attribut */
function render404(): string {
  const all = PAGE_LOCALES.map((l) => ({ l, c: landingCopy(l) }));
  return `<!doctype html>
<html lang="${DEFAULT_LOCALE}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${all.map(({ c }) => esc(c.notFound.title)).join(' · ')} – Pianist</title>
    <meta name="robots" content="noindex" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>
      html { background: #0b0605; color: #f2eadd; font-family: system-ui, sans-serif; }
      main { max-width: 36rem; margin: 0 auto; padding: 18vh 1.5rem 4rem; }
      h1 { font-size: clamp(1.8rem, 5vw, 2.6rem); line-height: 1.15; margin: 0 0 2rem; }
      h1 span { display: block; }
      h1 span + span { color: #b8ab9a; font-weight: 400; }
      p { margin: 0 0 0.4rem; line-height: 1.5; }
      section { margin-top: 1.6rem; }
      a { color: #fe6a00; }
    </style>
  </head>
  <body>
    <main>
      <h1>${all.map(({ l, c }) => `<span lang="${l}">${esc(c.notFound.title)}</span>`).join('')}</h1>
${all
  .map(
    ({ l, c }) => `      <section lang="${l}">
        <p>${esc(c.notFound.text)}</p>
        <p><a href="${localizedPath('home', l)}" hreflang="${l}">${esc(c.notFound.home)}</a></p>
      </section>`,
  )
  .join('\n')}
    </main>
  </body>
</html>
`;
}

/** sitemap.xml: jede Sprachfassung als eigene URL, jeweils mit allen Alternativen (hreflang) */
function renderSitemap(env: SiteEnv, today = new Date().toISOString().slice(0, 10)): string {
  const abs = (path: string) => esc(env.siteUrl + path);
  const urls = BUILT_ROUTES.flatMap((route) =>
    PAGE_LOCALES.map((locale) => {
      const links = alternates(route)
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${abs(a.path)}" />`)
        .join('\n');
      return `  <url>\n    <loc>${abs(localizedPath(route, locale))}</loc>\n    <lastmod>${today}</lastmod>\n${links}\n  </url>`;
    }),
  );
  // Die App selbst ist sprachneutral (eine URL, canonical /app/) und hat daher keine Alternativen
  urls.push(`  <url>\n    <loc>${abs('/app/')}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') +
    '\n</urlset>\n'
  );
}

function renderRobots(env: SiteEnv): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (env.siteUrl) lines.push('', `Sitemap: ${env.siteUrl}/sitemap.xml`);
  return lines.join('\n') + '\n';
}

const renderer: PageRenderer = { renderPage, render404, renderSitemap, renderRobots };
export default renderer;
