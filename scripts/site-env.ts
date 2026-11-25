import { loadEnv } from 'vite';
import type { SiteEnv } from './pages/types';

export type { SiteEnv };

/**
 * Adresse der Seite aus SITE_URL (Umgebungsvariable oder .env). Vercel setzt beim Build
 * VERCEL_PROJECT_PRODUCTION_URL (ohne Protokoll) automatisch.
 */
export function siteEnv(mode = 'production', root = process.cwd()): SiteEnv {
  const env = loadEnv(mode, root, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = (process.env.SITE_URL ?? env.SITE_URL ?? (vercel ? `https://${vercel}` : ''))
    .trim()
    .replace(/\/+$/, '');
  const githubUrl = (process.env.VITE_GITHUB_URL ?? env.VITE_GITHUB_URL ?? '').trim();
  return { siteUrl, githubUrl };
}
