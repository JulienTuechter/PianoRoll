/**
 * Service Worker registrieren (nur im Produktionsbuild; /sw.js entsteht beim Build, siehe vite.config.ts).
 * Meldet „offline bereit“ nach der ersten Installation und „neue Version“, sobald ein Update wartet.
 */
import { useApp } from './store/app-store';

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const firstInstall = !navigator.serviceWorker.controller;
        const track = (sw: ServiceWorker | null) => {
          sw?.addEventListener('statechange', () => {
            if (sw.state !== 'installed') return;
            if (firstInstall) useApp.getState().set({ offline: 'ready' });
            else {
              waiting = sw;
              useApp.getState().set({ offline: 'update' });
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          useApp.getState().set({ offline: 'update' });
        }
        track(reg.installing);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Lange offene Tabs: stündlich nach Updates sehen
        window.setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch((err) => console.warn('Service Worker nicht registriert', err));
  });
}

/** Wartende Version aktivieren und neu laden. */
export function applyUpdate(): void {
  if (!waiting) return location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage('skip-waiting');
}
