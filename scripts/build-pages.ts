/**
 * Rendert die statischen Seiten nach `vite build`:
 *   dist/index.html (en, x-default), dist/de/index.html, dist/404.html, dist/sitemap.xml, dist/robots.txt
 * Quelle: das von Vite verarbeitete Template dist/landing/index.html (mit gehashten Assets) und
 * src/i18n/{en,de}.json. Das Template wird danach entfernt.
 *
 *   npx tsx scripts/build-pages.ts      (läuft automatisch in npm run build)
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { siteEnv } from './site-env';
import { RENDER_MODULE, type PageRenderer } from './pages/types';
import { BUILT_ROUTES, localizedPath, PAGE_LOCALES } from '../src/i18n/routes';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const templatePath = join(dist, 'landing', 'index.html');

async function main(): Promise<void> {
  const template = await readFile(templatePath, 'utf8').catch(() => {
    throw new Error(`${templatePath} fehlt – zuerst \`vite build\` ausführen`);
  });
  const env = siteEnv('production', root);
  if (!env.siteUrl)
    console.warn('⚠ SITE_URL ist nicht gesetzt: canonical/hreflang relativ, keine sitemap.xml.');

  // Vites SSR-Loader löst die Landing-Komponenten (Aliase, import.meta.env, JSON) wie im Browser auf
  const vite = await createServer({
    root,
    mode: 'production',
    logLevel: 'warn',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const render = (await vite.ssrLoadModule(RENDER_MODULE)).default as PageRenderer;
    const out = async (path: string, content: string) => {
      const file = join(dist, path);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, content);
      console.log(`  dist${path.startsWith('/') ? '' : '/'}${path}`);
    };

    for (const route of BUILT_ROUTES)
      for (const locale of PAGE_LOCALES)
        await out(
          join(localizedPath(route, locale), 'index.html'),
          render.renderPage(template, route, locale, env),
        );
    await out('404.html', render.render404());
    await out('robots.txt', render.renderRobots(env));
    if (env.siteUrl) await out('sitemap.xml', render.renderSitemap(env));
  } finally {
    await vite.close();
  }
  await rm(dirname(templatePath), { recursive: true });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
