/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * SEO und Link-Vorschau: Link-Vorschauen (WhatsApp, Slack, Facebook …) brauchen absolute URLs.
 * Die öffentliche Adresse kommt aus SITE_URL (Umgebungsvariable oder .env), z. B. SITE_URL=https://pianist.example.
 * Ersetzt %SITE_URL% in index.html und erzeugt beim Build robots.txt und sitemap.xml.
 */
function seo(): Plugin {
  let siteUrl = '';
  return {
    name: 'pianist-seo',
    configResolved(config) {
      siteUrl = (process.env.SITE_URL ?? loadEnv(config.mode, process.cwd(), '').SITE_URL ?? '')
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
            `  <url><loc>${siteUrl}/</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>\n` +
            '</urlset>\n',
        });
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' });
    },
  };
}

export default defineConfig({
  plugins: [react(), seo()],
  resolve: {
    alias: {
      // Eingebettete VexFlow-Schriften (Data-URIs) für SVG/PNG-Export; die exports-Map von vexflow gibt sie nicht frei
      '@vexflow-fonts': fileURLToPath(new URL('./node_modules/vexflow/build/esm/src/fonts', import.meta.url)),
    },
  },
  server: { host: 'localhost', port: 5173 },
  // Lokale App: Hauptbundle ≈ 570 kB (Tone.js, tonal). VexFlow (inkl. eingebetteter Bravura-Schrift ≈ 720 kB)
  // wird erst beim Öffnen der Notenansicht per dynamic import geladen.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
