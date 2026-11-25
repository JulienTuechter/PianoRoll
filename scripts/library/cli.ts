/**
 * Bibliothek: Befehle für package.json
 *   prepare   (prebuild)  Katalog prüfen, neue Slugs vergeben, vercel.json abgleichen – bricht früh ab
 *   generate  (postbuild) Seiten, Bilder, Feeds, Sitemaps in dist/ erzeugen
 *   check     (postbuild) Katalog + dist/ prüfen (Crawler), Zusammenfassung ausgeben
 *   stubs     .mid-Dateien ohne Katalogeintrag → Stub-Einträge (TODO) in catalog.json
 *   rename <alt> <neu>    Slug bewusst ändern: slugs.json, redirects.json, vercel.json
 *   ping [--dry-run]      IndexNow: neue/geänderte URLs melden (nur wenn in library.config.ts aktiviert)
 * Option --root <ordner>: anderer Projektordner (Tests mit Beispieldaten)
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../library.config';
import { siteEnv } from '../site-env';
import { analyzeMidi, clock, schemaKey } from './analyze';
import { loadLibrary, readCatalog, readJson, sortedObject, writeJson } from './catalog';
import { checkDist } from './check';
import { generate, type Summary } from './generate';
import { slugify, RESERVED_SLUGS } from './slug';
import { syncVercel } from './vercel';
import { libraryPaths, LibraryError, type CatalogEntry } from './types';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const rootArg = flag('--root');
const root = rootArg ?? fileURLToPath(new URL('../..', import.meta.url));
const paths = libraryPaths(root);
const [command, ...rest] = args;
const CI = !!(process.env.CI || process.env.VERCEL);

function fail(title: string, problems: string[]): never {
  console.error(`\n✗ ${title}`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

async function prepare(): Promise<void> {
  const lib = await loadLibrary(paths, { writeSlugs: true });
  for (const w of lib.warnings) console.warn(`⚠ ${w}`);
  if (lib.newSlugs.length) {
    const msg = `Neue Slugs in library/slugs.json: ${lib.newSlugs.map((f) => lib.slugs[f]).join(', ')} – bitte committen.`;
    console.log(`• ${msg}`);
  }
  const vercelChanged = await syncVercel(paths, lib.redirects, !CI);
  if (vercelChanged)
    if (CI)
      fail('vercel.json passt nicht zu library/redirects.json', [
        'Lokal npm run build ausführen und vercel.json committen.',
      ]);
    else console.log('• vercel.json aktualisiert (Weiterleitungen) – bitte committen.');
  console.log(
    `✓ Bibliothek: ${lib.pieces.length} Stücke geprüft (${lib.entries.length - lib.pieces.length} nicht veröffentlicht)`,
  );
}

function printSummary(s: Summary): void {
  const kinds = Object.entries(s.pages).filter(([, v]) => Object.values(v).some((n) => n > 0));
  console.log('\nBibliotheksseiten');
  console.log(
    '  Typ          ' +
      Object.keys(s.pages.piece)
        .map((l) => l.padStart(6))
        .join(''),
  );
  for (const [kind, v] of kinds)
    console.log(
      `  ${kind.padEnd(12)} ${Object.values(v)
        .map((n) => String(n).padStart(6))
        .join('')}`,
    );
  const total = kinds.reduce((a, [, v]) => a + Object.values(v).reduce((x, y) => x + y, 0), 0);
  console.log(
    `  Summe        ${String(total).padStart(6)} Seiten, ${s.files} Dateien, ${s.pieces} Stücke, ${(s.ms / 1000).toFixed(1)} s`,
  );
  if (s.noindex.length) {
    console.log(`  noindex (unter ${config.minWords} Wörtern stückspezifischem Text): ${s.noindex.length}`);
    for (const n of s.noindex) console.log(`    ${n.path} – ${n.words} Wörter`);
  } else console.log('  noindex: keine');
}

async function runGenerate(): Promise<void> {
  const { siteUrl } = siteEnv('production', root);
  const summary = await generate(paths, siteUrl);
  for (const w of summary.warnings) console.warn(`⚠ ${w}`);
  printSummary(summary);
}

async function runCheck(): Promise<void> {
  const t0 = performance.now();
  const { siteUrl } = siteEnv('production', root);
  const lib = await loadLibrary(paths, { writeSlugs: false });
  const errors: string[] = [];
  if (lib.newSlugs.length)
    (CI ? errors : []).push(
      `Stücke ohne Slug in library/slugs.json: ${lib.newSlugs.join(', ')} (lokal bauen und committen)`,
    );
  if (await syncVercel(paths, lib.redirects, false))
    errors.push('vercel.json passt nicht zu library/redirects.json');
  const dist = checkDist(paths, siteUrl);
  errors.push(...dist.errors);
  for (const w of [...lib.warnings, ...dist.warnings]) console.warn(`⚠ ${w}`);
  if (errors.length) fail(`library:check – ${errors.length} Problem(e)`, errors);
  const st = dist.stats;
  console.log(
    `✓ library:check: ${st.libraryPages} Bibliotheksseiten (${st.indexable} indexierbar), ${st.links} interne Links ok, ` +
      `max. Klicktiefe ${st.maxDepth}, ${((performance.now() - t0) / 1000).toFixed(1)} s`,
  );
}

async function stubs(): Promise<void> {
  const entries = await readCatalog(paths);
  const known = new Set(entries.map((e) => e.file));
  const midi = existsSync(paths.midiDir)
    ? readdirSync(paths.midiDir)
        .filter((f) => /\.midi?$/i.test(f))
        .sort()
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const added: CatalogEntry[] = [];
  for (const file of midi) {
    if (known.has(file)) continue;
    try {
      const { stats: s } = analyzeMidi(new Uint8Array(readFileSync(join(paths.midiDir, file))));
      const n = (m: number) =>
        `${['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][m % 12]}${Math.floor(m / 12) - 1}`;
      added.push({
        file,
        title: 'TODO',
        composer: 'TODO',
        license: 'TODO',
        license_url: 'TODO (oder löschen und credit ausfüllen)',
        credit: 'TODO (oder löschen und license_url ausfüllen)',
        added: today,
        duration_sec: s.durationSec,
        tempo_bpm: s.tempoBpm,
        time_signature: s.timeSignature,
        // geschätzte Tonarten nicht festschreiben – die Seite kennzeichnet sie als geschätzt
        ...(s.key?.source === 'file' ? { key: schemaKey(s.key) } : {}),
        notes: s.notes,
        bars: s.bars,
        hands: s.hands,
        range: `${n(s.lowest)}-${n(s.highest)}`,
      });
      console.log(`+ ${file}: ${clock(s.durationSec)}, ${s.notes} Noten, ${s.timeSignature}`);
    } catch (err) {
      console.error(`✗ ${file}: nicht lesbar (${(err as Error).message}) – übersprungen`);
    }
  }
  if (!added.length) return console.log('Keine neuen .mid-Dateien – catalog.json ist vollständig.');
  await writeJson(paths.catalog, [...entries, ...added]);
  console.log(
    `\n${added.length} Stub(s) in public/library/catalog.json angelegt. Jetzt title, composer und license ausfüllen.`,
  );
}

async function rename(from?: string, to?: string): Promise<void> {
  if (!from || !to) fail('Aufruf: npm run library:rename -- <alter-slug> <neuer-slug>', []);
  if (slugify(to) !== to || RESERVED_SLUGS.has(to))
    fail(`„${to}“ ist kein gültiger Slug`, [`Vorschlag: ${slugify(to)}`]);
  const slugs = await readJson<Record<string, string>>(paths.slugs, {});
  const redirects = await readJson<Record<string, string>>(paths.redirects, {});
  const file = Object.keys(slugs).find((f) => slugs[f] === from);
  if (!file) fail(`Slug „${from}“ gibt es nicht in library/slugs.json`, []);
  if (Object.values(slugs).includes(to) || to in redirects)
    fail(`Slug „${to}“ ist schon vergeben oder war es früher`, []);
  slugs[file] = to;
  // bestehende Weiterleitungen auf den alten Slug zeigen jetzt direkt auf den neuen
  for (const k of Object.keys(redirects)) if (redirects[k] === from) redirects[k] = to;
  redirects[from] = to;
  await writeJson(paths.slugs, sortedObject(slugs));
  await writeJson(paths.redirects, sortedObject(redirects));
  await syncVercel(paths, redirects, true);
  console.log(
    `✓ ${file}: ${from} → ${to} (301 in vercel.json). slugs.json, redirects.json und vercel.json committen.`,
  );
}

/** IndexNow: nur URLs, deren Inhalt sich seit dem letzten Ping geändert hat */
async function ping(): Promise<void> {
  const dry = rest.includes('--dry-run');
  if (!config.indexNow.enabled && !dry) {
    console.log('IndexNow ist aus (library.config.ts → indexNow.enabled). Nichts gemeldet.');
    console.log(
      'Google nutzt IndexNow nicht: Es findet neue Seiten über sitemap.xml und die internen Links.',
    );
    return;
  }
  const { siteUrl } = siteEnv('production', root);
  if (!siteUrl)
    fail('SITE_URL fehlt', ['IndexNow braucht absolute URLs (SITE_URL=https://… npm run build).']);
  const host = new URL(siteUrl).host;
  const keyFile = join(root, 'public', `${config.indexNow.key}.txt`);
  if (!existsSync(keyFile) || readFileSync(keyFile, 'utf8').trim() !== config.indexNow.key)
    fail('IndexNow-Key-Datei fehlt oder passt nicht', [
      `public/${config.indexNow.key}.txt mit dem Key als Inhalt anlegen`,
    ]);

  const sitemaps = [
    'sitemap-pages.xml',
    ...readdirSync(paths.dist).filter((f) => /^sitemap-library-.*\.xml$/.test(f)),
  ];
  const urls = sitemaps.flatMap((f) =>
    existsSync(join(paths.dist, f))
      ? [...readFileSync(join(paths.dist, f), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
          m[1]!.replace(/&amp;/g, '&'),
        )
      : [],
  );
  if (!urls.length) fail('Keine URLs in dist/sitemap-*.xml', ['Zuerst npm run build (mit SITE_URL).']);
  const state = await readJson<Record<string, string>>(paths.indexNowState, {});
  const next: Record<string, string> = {};
  const changed: string[] = [];
  for (const url of urls) {
    const path = url.slice(siteUrl.length);
    const file = join(paths.dist, path.endsWith('/') ? `${path}index.html` : path);
    // Zeitstempel (lastmod) zählen nicht als Änderung
    const html = existsSync(file) ? (await readFile(file, 'utf8')).replace(/\?v=[0-9a-f]+/g, '') : '';
    next[url] = createHash('sha256').update(html).digest('hex').slice(0, 16);
    if (state[url] !== next[url]) changed.push(url);
  }
  console.log(`${changed.length} neue oder geänderte URL(s) von ${urls.length}.`);
  for (const u of changed.slice(0, 20)) console.log(`  ${u}`);
  if (changed.length > 20) console.log(`  … und ${changed.length - 20} weitere`);
  if (dry || !changed.length) {
    if (dry) console.log('(--dry-run: nichts gesendet, Stand nicht gespeichert)');
  } else {
    for (let i = 0; i < changed.length; i += 10000) {
      const res = await fetch(config.indexNow.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: config.indexNow.key,
          keyLocation: `${siteUrl}/${config.indexNow.key}.txt`,
          urlList: changed.slice(i, i + 10000),
        }),
      });
      if (!res.ok && res.status !== 202) fail(`IndexNow antwortet ${res.status}`, [await res.text()]);
    }
    await writeJson(paths.indexNowState, sortedObject(next));
    console.log(
      `✓ An IndexNow gemeldet (Bing, Yandex, Seznam, Naver …). Stand in library/indexnow-state.json – committen.`,
    );
  }
  console.log('Google nutzt IndexNow nicht: Es findet neue Seiten über sitemap.xml und die internen Links.');
}

async function main(): Promise<void> {
  switch (command) {
    case 'prepare':
      return prepare();
    case 'generate':
      return runGenerate();
    case 'check':
      return runCheck();
    case 'stubs':
      return stubs();
    case 'rename':
      return rename(rest[0], rest[1]);
    case 'ping':
      return ping();
    default:
      fail(`Unbekannter Befehl „${command ?? ''}“`, ['prepare | generate | check | stubs | rename | ping']);
  }
}

main().catch((err: unknown) => {
  if (err instanceof LibraryError)
    fail('Bibliothek: Katalog unvollständig – Build abgebrochen', err.problems);
  console.error(err);
  process.exit(1);
});
