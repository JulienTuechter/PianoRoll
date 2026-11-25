/** Schnittstelle zwischen den Build-Skripten (Node) und dem Seiten-Renderer (über Vites SSR-Loader geladen). */
import type { Locale } from '../../src/i18n/locale';
import type { RouteName } from '../../src/i18n/routes';

export interface SiteEnv {
  /** Öffentliche Adresse ohne Schrägstrich am Ende, z. B. https://pianist.example (leer = relative URLs) */
  siteUrl: string;
  /** Quellcode-Link (VITE_GITHUB_URL) */
  githubUrl: string;
}

/** Eintrag für „Neu in der Bibliothek“ auf der Startseite (scripts/library/latest.ts) */
export interface LatestPiece {
  title: string;
  composer: string;
  path: string;
}

/** sitemap.xml und robots.txt erzeugt scripts/library/ (Sitemap-Index inkl. Bibliothek) */
export interface PageRenderer {
  renderPage(template: string, route: RouteName, locale: Locale, env: SiteEnv, latest: LatestPiece[]): string;
  render404(): string;
}

/** Pfad für server.ssrLoadModule(); default-Export ist ein PageRenderer */
export const RENDER_MODULE = '/scripts/pages/render.ts';
