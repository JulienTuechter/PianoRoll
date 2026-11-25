/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { siteEnv } from './scripts/site-env.ts';
import { RENDER_MODULE, type PageRenderer } from './scripts/pages/types.ts';
import { localeFromPath, localizedPath, PAGE_LOCALES } from './src/i18n/routes.ts';

/**
 * Link-Vorschauen brauchen absolute URLs. Die öffentliche Adresse kommt aus SITE_URL (Umgebungsvariable oder
 * .env), z. B. SITE_URL=https://pianist.example; ersetzt %SITE_URL% in app/index.html.
 * Die Landingpage (/, /de/), 404.html, sitemap.xml und robots.txt rendert scripts/build-pages.ts nach dem Build.
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
      server.middlewares.use((req, res, next) => {
        const path = route(req, res, next);
        if (!path) return;
        void (async () => {
          const raw = await readFile(fileURLToPath(new URL('./landing/index.html', import.meta.url)), 'utf8');
          const template = await server.transformIndexHtml('/landing/index.html', raw, req.originalUrl);
          const render = (await server.ssrLoadModule(RENDER_MODULE)).default as PageRenderer;
          const html = render.renderPage(template, 'home', localeFromPath(path), env);
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
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
