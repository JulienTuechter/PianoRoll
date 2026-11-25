/** Schnittstelle zwischen den Build-Skripten (Node) und dem Seiten-Renderer (über Vites SSR-Loader geladen). */
import type { Locale } from '../../src/i18n/locale';
import type { RouteName } from '../../src/i18n/routes';

export interface SiteEnv {
  /** Öffentliche Adresse ohne Schrägstrich am Ende, z. B. https://pianist.example (leer = relative URLs) */
  siteUrl: string;
  /** Quellcode-Link (VITE_GITHUB_URL) */
  githubUrl: string;
}

export interface PageRenderer {
  renderPage(template: string, route: RouteName, locale: Locale, env: SiteEnv): string;
  render404(): string;
  renderSitemap(env: SiteEnv): string;
  renderRobots(env: SiteEnv): string;
}

/** Pfad für server.ssrLoadModule(); default-Export ist ein PageRenderer */
export const RENDER_MODULE = '/scripts/pages/render.ts';
