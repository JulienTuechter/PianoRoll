/**
 * Service Worker (wird beim Build vom Plugin „pianist-offline“ in vite.config.ts als /sw.js ausgegeben).
 * Hält App, Schriften, VexFlow, Katalog und die Piano-Samples vor, damit die App ohne Netz startet.
 *
 * PRECACHE: [url, revision] – revision ist ein Inhalts-Hash bzw. null für Dateien mit Hash im Namen.
 * Unveränderte Dateien bleiben über Versionen hinweg im Cache (die Samples werden nur einmal geladen).
 */
const PRECACHE = self.__PRECACHE__;
const CACHE = 'pianist-precache-v1';
const RUNTIME = 'pianist-runtime-v1';
const APP_SHELL = '/app/';
const NETWORK_TIMEOUT_MS = 3000;

const keyFor = (url, rev) => (rev ? `${url}${url.includes('?') ? '&' : '?'}__rev=${rev}` : url);
const precached = new Map(
  PRECACHE.map(([url, rev]) => [new URL(url, self.location.origin).href, keyFor(url, rev)]),
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PRECACHE.map(async ([url, rev]) => {
          const key = keyFor(url, rev);
          if (await cache.match(key)) return;
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`${url}: ${res.status}`);
          await cache.put(key, res);
        }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const wanted = new Set([...precached.values()].map((k) => new URL(k, self.location.origin).href));
      const cache = await caches.open(CACHE);
      for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
      for (const name of await caches.keys())
        if (name.startsWith('pianist-') && name !== CACHE && name !== RUNTIME) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
});

async function fromPrecache(href) {
  const key = precached.get(href);
  if (!key) return undefined;
  return (await caches.open(CACHE)).match(key);
}

/** Seitenaufrufe: Netz zuerst (mit Timeout), sonst die vorgehaltene Seite. */
async function navigate(request) {
  const url = new URL(request.url);
  const shell = url.pathname.startsWith('/app') ? new URL(APP_SHELL, url).href : url.origin + url.pathname;
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok && !precached.has(shell)) (await caches.open(RUNTIME)).put(request, res.clone());
    return res;
  } catch (err) {
    const cached = (await fromPrecache(shell)) ?? (await caches.match(request));
    if (cached) return cached;
    throw err;
  }
}

/** Dateien: Vorgehaltenes sofort, sonst Netz (gleiche Herkunft wird für später gemerkt). */
async function asset(request) {
  const url = new URL(request.url);
  const hit = (await fromPrecache(url.href)) ?? (await caches.match(request));
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && url.origin === self.location.origin) (await caches.open(RUNTIME)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.headers.has('range')) return;
  event.respondWith(request.mode === 'navigate' ? navigate(request) : asset(request));
});
