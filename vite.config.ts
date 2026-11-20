/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * SEO und Link-Vorschau: Link-Vorschauen (WhatsApp, Slack, Facebook …) brauchen absolute URLs.
 * Die öffentliche Adresse kommt aus SITE_URL (Umgebungsvariable oder .env), z. B. SITE_URL=https://pianist.example.
 * Ersetzt %SITE_URL% in den HTML-Seiten und erzeugt beim Build robots.txt und sitemap.xml.
 */
function seo(): Plugin {
  let siteUrl = '';
  return {
    name: 'pianist-seo',
    configResolved(config) {
      // Vercel setzt VERCEL_PROJECT_PRODUCTION_URL (ohne Protokoll) beim Build automatisch
      const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
      siteUrl = (
        process.env.SITE_URL ??
        loadEnv(config.mode, process.cwd(), '').SITE_URL ??
        (vercel ? `https://${vercel}` : '')
      )
        .trim()
        .replace(/\/+$/, '');
      if (config.command === 'build' && !siteUrl)
        config.logger.warn(
          '\n⚠ SITE_URL ist nicht gesetzt: Link-Vorschauen (og:image, og:url) bekommen nur relative Pfade.\n' +
            '  Beispiel: SITE_URL=https://pianist.example npm run build\n',
        );
    },
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /'];
      if (siteUrl) {
        robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source:
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
            [`${siteUrl}/`, `${siteUrl}/app/`]
              .map(
                (loc) =>
                  `  <url><loc>${loc}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n`,
              )
              .join('') +
            '</urlset>\n',
        });
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });
    },
  };
}

/**
 * Seiten: Die Landingpage liegt komplett in landing/, wird aber unter / ausgeliefert; die App liegt unter /app/.
 * Dev/Preview: / → landing/index.html, /app → /app/. Build: landing/index.html landet als dist/index.html.
 */
function pages(): Plugin {
  const route = (
    req: { url?: string },
    res: import('node:http').ServerResponse,
    next: () => void,
    dev: boolean,
  ) => {
    const [path, query] = (req.url ?? '').split('?');
    const q = query ? `?${query}` : '';
    if (path === '/app') {
      res.statusCode = 301;
      res.setHeader('Location', `/app/${q}`);
      return res.end();
    }
    if (dev && (path === '/' || path === '/index.html')) req.url = `/landing/index.html${q}`;
    next();
  };
  return {
    name: 'pianist-pages',
    enforce: 'post',
    configureServer: (server) => void server.middlewares.use((req, res, next) => route(req, res, next, true)),
    configurePreviewServer: (server) =>
      void server.middlewares.use((req, res, next) => route(req, res, next, false)),
    generateBundle(_, bundle) {
      const landing = bundle['landing/index.html'];
      if (landing?.type !== 'asset') return;
      delete bundle['landing/index.html'];
      this.emitFile({ type: 'asset', fileName: 'index.html', source: landing.source });
    },
  };
}

/**
 * Offline: erzeugt beim Build /sw.js (Quelle: src/sw/service-worker.js) mit einer Precache-Liste.
 * Vorgehalten wird alles, was die App unter /app/ braucht (inkl. nachgeladener Chunks wie VexFlow und der
 * Katalog-Dateien), dazu Piano-Samples, Icons und Manifest aus public/. Die Landingpage wird nicht vorgehalten.
 */
function offline(): Plugin {
  const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex').slice(0, 12);
  const publicDir = fileURLToPath(new URL('./public', import.meta.url));
  const PUBLIC_FILES = [
    /^samples\/piano\/.+\.mp3$/,
    /^(favicon\.svg|icon-\d+\.png|apple-touch-icon\.png)$/,
    /^site\.webmanifest$/,
  ];
  return {
    name: 'pianist-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const entry = Object.values(bundle).find(
        (c) => c.type === 'chunk' && c.isEntry && c.facadeModuleId?.endsWith('/app/index.html'),
      );
      if (!entry || entry.type !== 'chunk')
        return this.warn('App-Entry nicht gefunden – kein Service Worker');

      // Alles, was vom App-Entry aus (auch dynamisch) erreichbar ist
      const files = new Set<string>();
      const visit = (fileName: string) => {
        if (files.has(fileName)) return;
        const item = bundle[fileName];
        if (!item) return;
        files.add(fileName);
        if (item.type !== 'chunk') return;
        [...item.imports, ...item.dynamicImports].forEach(visit);
        item.viteMetadata?.importedCss.forEach(visit);
        item.viteMetadata?.importedAssets.forEach(visit);
      };
      visit(entry.fileName);
      // Schriften u. a. werden aus dem CSS referenziert
      for (const f of [...files]) {
        const item = bundle[f];
        if (item?.type === 'asset' && f.endsWith('.css')) {
          const css = typeof item.source === 'string' ? item.source : new TextDecoder().decode(item.source);
          for (const [, ref] of css.matchAll(/url\(["']?\/?([^"')]+)["']?\)/g))
            if (ref && bundle[ref]) files.add(ref);
        }
      }

      const precache: [string, string | null][] = [];
      // HTML der App unter /app/ (Revision = Inhalt), gehashte Dateien ohne Revision
      const html = bundle['app/index.html'];
      if (html?.type === 'asset') precache.push(['/app/', hash(html.source)]);
      for (const f of [...files].sort())
        precache.push([
          `/${f}`,
          /-[\w-]{8}\.\w+$/.test(f)
            ? null
            : hash(
                (() => {
                  const item = bundle[f]!;
                  return item.type === 'chunk' ? item.code : item.source;
                })(),
              ),
        ]);
      const walk = (dir: string, prefix = ''): string[] =>
        readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
          d.isDirectory() ? walk(`${dir}/${d.name}`, `${prefix}${d.name}/`) : [`${prefix}${d.name}`],
        );
      for (const f of walk(publicDir).sort())
        if (PUBLIC_FILES.some((re) => re.test(f)))
          precache.push([`/${f}`, hash(readFileSync(`${publicDir}/${f}`))]);

      const source = readFileSync(
        fileURLToPath(new URL('./src/sw/service-worker.js', import.meta.url)),
        'utf8',
      );
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: source.replace('self.__PRECACHE__', JSON.stringify(precache)),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), seo(), pages(), offline()],
  resolve: {
    alias: {
      // Eingebettete VexFlow-Schriften (Data-URIs) für SVG/PNG-Export; die exports-Map von vexflow gibt sie nicht frei
      '@vexflow-fonts': fileURLToPath(new URL('./node_modules/vexflow/build/esm/src/fonts', import.meta.url)),
    },
  },
  server: { host: 'localhost', port: 5173 },
  // Lokale App: Hauptbundle ≈ 570 kB (Tone.js, tonal). VexFlow (inkl. eingebetteter Bravura-Schrift ≈ 720 kB)
  // wird erst beim Öffnen der Notenansicht per dynamic import geladen.
  build: {
    chunkSizeWarningLimit: 800,
    // Zwei Seiten: Landingpage auf / und die App auf /app/
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./landing/index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
