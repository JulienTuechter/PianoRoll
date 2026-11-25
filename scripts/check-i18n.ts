/**
 * npm run check:i18n – schlägt fehl (Exit-Code 1) bei:
 *   - Keys, die nur in einer Sprache existieren, leeren Texten, abweichenden {Platzhaltern}
 *   - gebauten Seiten (dist/) mit falschem <html lang>, fehlendem/nicht gegenseitigem hreflang,
 *     canonical ≠ eigene URL, Title außerhalb 51–70 bzw. Description außerhalb 120–160 Zeichen,
 *     mehr oder weniger als einer H1
 * Voraussetzung für den Seitenteil: npm run build.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alternates, BUILT_ROUTES, localizedPath, PAGE_LOCALES } from '../src/i18n/routes';

const root = fileURLToPath(new URL('..', import.meta.url));
const errors: string[] = [];
const fail = (msg: string) => errors.push(msg);

/* ── 1. Texte ───────────────────────────────────────────── */

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const isComment = (key: string) => key.startsWith('//');

/** Blätter als Pfad → Wert; Kommentar-Keys („// REVIEW“) zählen nicht */
function leaves(value: Json, prefix = ''): Map<string, Json> {
  const out = new Map<string, Json>();
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value)
      ? value.map((v, i) => [String(i), v] as const)
      : Object.entries(value);
    for (const [k, v] of entries) {
      if (isComment(k)) continue;
      for (const [p, leaf] of leaves(v, prefix ? `${prefix}.${k}` : k)) out.set(p, leaf);
    }
  } else out.set(prefix, value);
  return out;
}

const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

const texts = new Map<string, Map<string, Json>>();
for (const locale of PAGE_LOCALES) {
  const raw = await readFile(join(root, 'src/i18n', `${locale}.json`), 'utf8');
  texts.set(locale, leaves(JSON.parse(raw) as Json));
}
const allKeys = new Set([...texts.values()].flatMap((m) => [...m.keys()]));
for (const key of allKeys) {
  const present = PAGE_LOCALES.filter((l) => texts.get(l)?.has(key));
  if (present.length !== PAGE_LOCALES.length)
    fail(
      `Key „${key}“ nur in: ${present.join(', ')} (fehlt in ${PAGE_LOCALES.filter((l) => !present.includes(l)).join(', ')})`,
    );
  for (const l of present) {
    const v = texts.get(l)?.get(key);
    if (typeof v !== 'string') fail(`${l}.json: „${key}“ ist kein Text`);
    else if (!v.trim()) fail(`${l}.json: „${key}“ ist leer`);
  }
  const ph = new Set(present.map((l) => placeholders(String(texts.get(l)?.get(key) ?? ''))));
  if (ph.size > 1) fail(`Key „${key}“: Platzhalter unterscheiden sich zwischen den Sprachen`);
}

/* ── 2. Gebaute Seiten ──────────────────────────────────── */

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, '&');
/** Pfad einer (evtl. absoluten) URL */
const pathOf = (href: string) => (/^https?:/.test(href) ? new URL(href).pathname : href);

interface PageInfo {
  path: string;
  hreflang: Map<string, string>;
}
const pages: PageInfo[] = [];

async function readPage(path: string): Promise<string | null> {
  const file = join(root, 'dist', path.replace(/\/$/, '/index.html'));
  return readFile(file, 'utf8').catch(() => {
    fail(`${path}: ${file} fehlt – zuerst npm run build`);
    return null;
  });
}

for (const route of BUILT_ROUTES)
  for (const locale of PAGE_LOCALES) {
    const path = localizedPath(route, locale);
    const html = await readPage(path);
    if (html === null) continue;
    const at = (msg: string) => fail(`${path}: ${msg}`);

    const lang = /<html\b[^>]*\blang="([^"]*)"/.exec(html)?.[1];
    if (lang !== locale) at(`<html lang="${lang}"> statt "${locale}"`);

    const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '');
    if (title.length < 51 || title.length > 70) at(`Title hat ${title.length} Zeichen (51–70): „${title}“`);

    const descTag = /<meta\s+name="description"[^>]*>/.exec(html)?.[0] ?? '';
    const desc = decode(attr(descTag, 'content') ?? '');
    if (desc.length < 120 || desc.length > 160)
      at(`Meta Description hat ${desc.length} Zeichen (120–160): „${desc}“`);

    const h1 = html.match(/<h1[\s>]/g)?.length ?? 0;
    if (h1 !== 1) at(`${h1} H1-Überschriften (genau 1 erlaubt)`);

    const canonical = /<link\s+rel="canonical"[^>]*>/.exec(html)?.[0];
    const canonicalHref = canonical && attr(canonical, 'href');
    if (!canonicalHref || pathOf(canonicalHref) !== path)
      at(`canonical „${canonicalHref}“ zeigt nicht auf ${path}`);

    const hreflang = new Map<string, string>();
    for (const tag of html.match(/<link\s+rel="alternate"[^>]*>/g) ?? []) {
      const hl = attr(tag, 'hreflang');
      const href = attr(tag, 'href');
      if (hl && href) hreflang.set(hl, pathOf(href));
    }
    for (const a of alternates(route)) {
      const got = hreflang.get(a.hreflang);
      if (got !== a.path) at(`hreflang="${a.hreflang}" ist „${got ?? 'fehlt'}“, erwartet ${a.path}`);
    }
    if (hreflang.get(locale) !== path) at(`hreflang verweist nicht auf die Seite selbst`);

    const ogLocale = /<meta\s+property="og:locale"\s+content="([^"]*)"/.exec(html)?.[1];
    if (!ogLocale?.toLowerCase().startsWith(locale)) at(`og:locale „${ogLocale}“ passt nicht zu ${locale}`);
    const ldLang = /"inLanguage":\s*"([^"]*)"/.exec(html)?.[1];
    if (ldLang !== locale) at(`JSON-LD inLanguage „${ldLang}“ statt ${locale}`);

    // Ohne JS vollständig und einsprachig: Kernaussagen dieser Sprache im HTML, keine der anderen Sprachen
    const body = visibleText(html);
    for (const [key, text] of coreTexts(locale))
      if (!body.includes(text)) at(`vorgerenderter Text fehlt: ${key} „${text}“`);
    for (const other of PAGE_LOCALES.filter((l) => l !== locale))
      for (const [key, text] of coreTexts(other))
        if (text !== texts.get(locale)?.get(key) && body.includes(text))
          at(`enthält ${other}-Text ${key} „${text}“`);

    pages.push({ path, hreflang });
  }

// Gegenseitigkeit: jede Seite, auf die verwiesen wird, verweist mit denselben Alternativen zurück
for (const page of pages)
  for (const [hl, target] of page.hreflang) {
    const other = pages.find((p) => p.path === target);
    if (!other) fail(`${page.path}: hreflang="${hl}" → ${target}, diese Seite wurde nicht gebaut`);
    else if ([...page.hreflang].some(([k, v]) => other.hreflang.get(k) !== v))
      fail(`${page.path} ↔ ${other.path}: hreflang-Angaben sind nicht gegenseitig`);
  }

// 404: eine H1, Links zu allen Startseiten
const notFound = await readFile(join(root, 'dist/404.html'), 'utf8').catch(() => null);
if (notFound === null) fail('dist/404.html fehlt');
else {
  if ((notFound.match(/<h1[\s>]/g)?.length ?? 0) !== 1) fail('404.html: nicht genau eine H1');
  for (const l of PAGE_LOCALES)
    if (!notFound.includes(`href="${localizedPath('home', l)}"`))
      fail(`404.html: Link zu ${localizedPath('home', l)} fehlt`);
}

/** Sichtbarer Text des <body> (Tags entfernt, Entities aufgelöst) */
function visibleText(html: string): string {
  const body = html.slice(html.indexOf('<body'));
  return decode(body.replace(/<script\b[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '')).replace(
    /\s+/g,
    ' ',
  );
}

/** Überschriften, Kicker und Einleitungen der Landingpage einer Sprache (Pfad → Text) */
function coreTexts(locale: string): [string, string][] {
  return [...(texts.get(locale) ?? new Map<string, Json>())]
    .filter(([k]) => /\.(kicker|title\d?|lead)$/.test(k) && !/^(meta|notFound)\./.test(k))
    .map(([k, v]) => [k, String(v)]);
}

/* ── Ergebnis ───────────────────────────────────────────── */

if (errors.length) {
  console.error(`✗ check:i18n – ${errors.length} Fehler:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(
  `✓ check:i18n – ${allKeys.size} Keys in ${PAGE_LOCALES.join('/')}, ${pages.length} Seiten + 404.html geprüft`,
);
