/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { siteEnv } from './scripts/site-env.ts';
import { RENDER_MODULE, type PageRenderer } from './scripts/pages/types.ts';
import { localeFromPath, localizedPath, PAGE_LOCALES } from './src/i18n/routes.ts';
import { latestPieces } from './scripts/library/latest.ts';

/**
 * Link-Vorschauen brauchen absolute URLs. Die öffentliche Adresse kommt aus SITE_URL (Umgebungsvariable oder
 * .env), z. B. SITE_URL=https://pianist.example; ersetzt %SITE_URL% in app/index.html.
 * Die Landingpage (/, /de/) und 404.html rendert scripts/build-pages.ts nach dem Build, die Bibliothek,
 * sitemap.xml und robots.txt erzeugt scripts/library/ (postbuild).
 */
function seo(): Plugin {
  let siteUrl = '';
  return {
    name: 'pianist-seo',
    configResolved(config) {
      siteUrl = siteEnv(config.mode, config.root).siteUrl;
      if (config.command === 'build' && !siteUrl)
        config.logger.warn(
          '\n⚠ SITE_URL ist nicht gesetzt: Link-Vorschauen (og:image, og:url) bekommen nur relative Pfade.\n' +
            '  Beispiel: SITE_URL=https://pianist.example npm run build\n',
        );
    },
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
  };
}

/**
 * Seiten: Die Landingpage liegt in landing/ und wird je Sprache unter / (en) und /de/ (de) ausgeliefert,
 * die App unter /app/. Dev: / und /de/ werden wie beim Build serverseitig gerendert (scripts/pages/render.ts).
 * Build: landing/index.html bleibt als Template in dist/landing/ und wird von scripts/build-pages.ts ersetzt.
 */
function pages(): Plugin {
  const landingPaths = new Set(PAGE_LOCALES.map((l) => localizedPath('home', l)));
  const redirect = (path: string): string | null => {
    if (path === '/app') return '/app/';
    if (!path.endsWith('/') && landingPaths.has(`${path}/`)) return `${path}/`;
    return null;
  };
  const route = (
    req: { url?: string },
    res: import('node:http').ServerResponse,
    next: () => void,
  ): string | null => {
    const [path = '', query] = (req.url ?? '').split('?');
    const target = redirect(path);
    if (target) {
      res.statusCode = 301;
      res.setHeader('Location', target + (query ? `?${query}` : ''));
      res.end();
      return null;
    }
    if (path === '/index.html') return '/';
    if (landingPaths.has(path)) return path;
    next();
    return null;
  };
  return {
    name: 'pianist-pages',
    enforce: 'post',
    configureServer(server) {
      const env = siteEnv(server.config.mode, server.config.root);
      server.middlewares.use(libraryDevMiddleware(server, env.siteUrl));
      server.middlewares.use((req, res, next) => {
        const path = route(req, res, next);
        if (!path) return;
        void (async () => {
          const raw = await readFile(fileURLToPath(new URL('./landing/index.html', import.meta.url)), 'utf8');
          const template = await server.transformIndexHtml('/landing/index.html', raw, req.originalUrl);
          const render = (await server.ssrLoadModule(RENDER_MODULE)).default as PageRenderer;
          const locale = localeFromPath(path);
          const html = render.renderPage(
            template,
            'home',
            locale,
            env,
            latestPieces(server.config.root, locale),
          );
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        })().catch((err: Error) => {
          server.ssrFixStacktrace(err);
          next(err);
        });
      });
    },
    // Preview liefert dist/ aus (dist/de/index.html usw.), nur die Weiterleitungen fehlen dort
    configurePreviewServer: (server) =>
      void server.middlewares.use((req, res, next) => {
        const [path = '', query] = (req.url ?? '').split('?');
        const target = redirect(path);
        if (!target) return next();
        res.statusCode = 301;
        res.setHeader('Location', target + (query ? `?${query}` : ''));
        res.end();
      }),
  };
}

/**
 * Bibliotheksseiten im Dev-Server: derselbe Generator wie im postbuild (scripts/library/generate.ts, über Vites
 * SSR-Loader), Ausgabe in node_modules/.cache/library-dev/. Neu erzeugt bei der nächsten Anfrage, sobald sich
 * Katalog, MIDI-Dateien, Slugs, handgeschriebene Texte, Bibliothekstexte oder der Generator ändern.
 * Dateien, die dort nicht liegen (midi/, library.css, catalog.json), liefert Vite wie gewohnt aus public/.
 */
const LIBRARY_GENERATOR = '/scripts/library/generate.ts';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

function libraryDevMiddleware(server: import('vite').ViteDevServer, siteUrl: string) {
  const root = server.config.root;
  const out = join(root, 'node_modules/.cache/library-dev');
  const prefixes = PAGE_LOCALES.map((l) => localizedPath('library', l));
  const watched = [
    'public/library',
    'library',
    'content',
    'scripts/library',
    'src/i18n/library',
    'library.config.ts',
  ];
  let built: Promise<void> | null = null;
  server.watcher.add(watched.map((w) => join(root, w)));
  server.watcher.on('all', (_event, file) => {
    const rel = relative(root, file).split(sep).join('/');
    if (watched.some((w) => rel === w || rel.startsWith(`${w}/`))) built = null;
  });
  const build = () =>
    (built ??= (async () => {
      const { generate } = (await server.ssrLoadModule(
        LIBRARY_GENERATOR,
      )) as typeof import('./scripts/library/generate.ts');
      const { libraryPaths } = (await server.ssrLoadModule(
        '/scripts/library/types.ts',
      )) as typeof import('./scripts/library/types.ts');
      await generate({ ...libraryPaths(root), dist: out }, siteUrl);
    })().catch((err: unknown) => {
      built = null;
      throw err;
    }));

  return (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
    next: () => void,
  ) => {
    const path = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
    if (!prefixes.some((p) => path.startsWith(p) || `${path}/` === p)) return next();
    build()
      .then(() => {
        let file = join(out, path);
        if (existsSync(file) && statSync(file).isDirectory()) {
          if (!path.endsWith('/')) {
            res.statusCode = 301;
            res.setHeader('Location', `${path}/`);
            return res.end();
          }
          file = join(file, 'index.html');
        }
        if (!existsSync(file)) return next();
        res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
        void readFile(file).then((data) => res.end(data));
      })
      .catch((err: unknown) => {
        // Katalogfehler (TODO, Lizenz …) lesbar im Browser zeigen
        const problems = (err as { problems?: string[] }).problems;
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(problems ? `Bibliothek:\n- ${problems.join('\n- ')}\n` : String((err as Error).stack ?? err));
      });
  };
}

export default defineConfig({
  plugins: [react(), seo(), pages()],
  resolve: {
    alias: {
      // Eingebettete VexFlow-Schriften (Data-URIs) für SVG/PNG-Export; die exports-Map von vexflow gibt sie nicht frei
      '@vexflow-fonts': fileURLToPath(new URL('./node_modules/vexflow/build/esm/src/fonts', import.meta.url)),
    },
  },
  server: { host: 'localhost', port: 5173 },
  // Vorrendern der Landingpage: CommonJS-Paket ohne benannte ESM-Exporte von Vite umwandeln lassen
  ssr: { noExternal: ['@tonejs/midi'], optimizeDeps: { include: ['@tonejs/midi'] } },
  // Lokale App: Hauptbundle ≈ 570 kB (Tone.js, tonal). VexFlow (inkl. eingebetteter Bravura-Schrift ≈ 720 kB)
  // wird erst beim Öffnen der Notenansicht per dynamic import geladen.
  build: {
    chunkSizeWarningLimit: 800,
    // Zwei Einstiege: Landingpage-Template (→ /, /de/ via scripts/build-pages.ts) und die App auf /app/
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL('./landing/index.html', import.meta.url)),
        app: fileURLToPath(new URL('./app/index.html', import.meta.url)),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});
