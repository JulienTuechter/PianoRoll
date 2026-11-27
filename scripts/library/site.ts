/**
 * Seiten der Bibliothek je Sprache: Stück, Komponist (ab 3 Stücken), Sammlung (ab 2), Stufe, Übersicht.
 * Erst entstehen Seitenbeschreibungen (SitePage), dann entscheiden Wortzahl (noindex), eindeutige Titel und
 * hreflang (nur wenn beide Sprachfassungen indexierbar sind), zuletzt rendert layout() das HTML.
 */
import config from '../../library.config';
import { libraryCopy, type LibraryCopy } from '../../src/i18n/library';
import type { Locale } from '../../src/i18n/locale';
import { appPath, DEFAULT_LOCALE, LOCALE_INFO, localizedPath, PAGE_LOCALES } from '../../src/i18n/routes';
import { clock, keyName, noteName, schemaKey } from './analyze';
import { ROLL_H, ROLL_W } from './roll';
import {
  esc,
  fitDescription,
  fittingTitles,
  fmt,
  htmlText,
  joinList,
  markdown,
  pick,
  wordCount,
} from './text';
import type { Piece } from './types';

export type PageKind = 'piece' | 'composer' | 'collection' | 'level' | 'overview';

export interface Crumb {
  name: string;
  path: string;
}

export interface SitePage {
  /** gleich für alle Sprachfassungen, z. B. „piece:mozart-die-zauberfloete“ */
  id: string;
  kind: PageKind;
  locale: Locale;
  path: string;
  titleCandidates: string[];
  title: string;
  description: string;
  h1: string;
  crumbs: Crumb[];
  main: string;
  words: number;
  indexable: boolean;
  hreflang: boolean;
  lastmod: string;
  image: { path: string; alt: string; width: number; height: number; type: string } | null;
  jsonLd: Record<string, unknown>[];
  appHref: string;
  /** Stücke, die auf dieser Seite gelistet sind (Feed, Sitemap) */
  piece?: Piece;
}

/** Handgeschriebene Texte: content/pieces/<slug>.<locale>.md, content/composers/<slug>.<locale>.md */
export type ContentLookup = (kind: 'pieces' | 'composers', slug: string, locale: Locale) => string | null;

export interface Group {
  slug: string;
  name: string;
  pieces: Piece[];
}

export type ComposerGroup = Group & { short: string; names: Piece['composers'] };

export interface Groups {
  composers: Map<string, ComposerGroup>;
  collections: Map<string, Group>;
  levels: Map<number, Piece[]>;
}

export function groupPieces(pieces: readonly Piece[]): Groups {
  const composers = new Map<string, ComposerGroup>();
  const collections = new Map<string, Group>();
  const levels = new Map<number, Piece[]>();
  for (const p of pieces) {
    const c = composers.get(p.composerSlug) ?? {
      slug: p.composerSlug,
      name: p.composer,
      short: p.composerShort,
      names: p.composers,
      pieces: [],
    };
    c.pieces.push(p);
    composers.set(p.composerSlug, c);
    if (p.collection && p.collectionSlug) {
      const g = collections.get(p.collectionSlug) ?? {
        slug: p.collectionSlug,
        name: p.collection,
        pieces: [],
      };
      g.pieces.push(p);
      collections.set(p.collectionSlug, g);
    }
    if (p.level !== null) levels.set(p.level, [...(levels.get(p.level) ?? []), p]);
  }
  return { composers, collections, levels };
}

export const hasComposerPage = (g: Groups, slug: string) =>
  (g.composers.get(slug)?.pieces.length ?? 0) >= config.composerMinPieces;
export const hasCollectionPage = (g: Groups, slug: string | null) =>
  !!slug && (g.collections.get(slug)?.pieces.length ?? 0) >= config.collectionMinPieces;

export const levelName = (level: number, locale: Locale) =>
  config.levels[level]?.[locale] ?? fmt(libraryCopy(locale).level.name, { level });

const byTitle = (l: Locale) => (a: Piece, b: Piece) => a.titles[l].localeCompare(b.titles[l], l);
const quote = (s: string, l: Locale) => (l === 'de' ? `„${s}“` : `“${s}”`);
const orWord = (l: Locale) => (l === 'de' ? 'oder' : 'or');
const andWord = (l: Locale) => (l === 'de' ? 'und' : 'and');
const num = (n: number, l: Locale) => n.toLocaleString(l === 'de' ? 'de-DE' : 'en-US');
const minutes = (sec: number, l: Locale) =>
  (Math.round(sec / 6) / 10).toLocaleString(l === 'de' ? 'de-DE' : 'en-US', { maximumFractionDigits: 1 });

/** Pfade */
export const piecePath = (p: Piece, l: Locale) => localizedPath('piece', l, { slug: p.slug });
export const composerPath = (slug: string, l: Locale) => localizedPath('composer', l, { composer: slug });
export const collectionPath = (slug: string, l: Locale) =>
  localizedPath('collection', l, { collection: slug });
export const levelPath = (level: number, l: Locale) => localizedPath('level', l, { level: String(level) });
export const overviewPath = (l: Locale) => localizedPath('library', l);
export const rollSvgPath = (p: Piece) =>
  `${localizedPath('piece', DEFAULT_LOCALE, { slug: p.slug })}piano-roll.svg`;
export const rollPngPath = (p: Piece) => `${localizedPath('piece', DEFAULT_LOCALE, { slug: p.slug })}og.png`;
export const midiPath = (p: Piece) => `/library/midi/${encodeURIComponent(p.entry.file)}`;

/** Link auf den Komponisten: eigene Seite oder Abschnitt der Übersicht */
function composerHref(g: Groups, p: Piece, l: Locale): string {
  return hasComposerPage(g, p.composerSlug)
    ? composerPath(p.composerSlug, l)
    : `${overviewPath(l)}#c-${p.composerSlug}`;
}

function aliasesFor(p: Piece, l: Locale): string[] {
  const seen = new Set([p.titles[l].toLowerCase()]);
  const out: string[] = [];
  // der Titel der anderen Sprache ist ebenfalls ein Suchname
  for (const a of [...PAGE_LOCALES.map((o) => p.titles[o]), ...p.aliases])
    if (!seen.has(a.toLowerCase())) {
      seen.add(a.toLowerCase());
      out.push(a);
    }
  return out;
}

/** Ähnliche Stücke: gleiche Sammlung, gleicher Komponist, gleiche Stufe, dann zeitliche Nähe */
export function relatedPieces(p: Piece, all: readonly Piece[], n = config.relatedPieces): Piece[] {
  const score = (o: Piece) =>
    (o.collectionSlug && o.collectionSlug === p.collectionSlug ? 4 : 0) +
    (o.composerSlug === p.composerSlug ? 3 : 0) +
    (o.level !== null && o.level === p.level ? 2 : 0) +
    (o.stats.key && p.stats.key && o.stats.key.tonicPc === p.stats.key.tonicPc ? 0.5 : 0);
  const days = (o: Piece) => Math.abs(Date.parse(o.added) - Date.parse(p.added)) / 864e5;
  return all
    .filter((o) => o !== p)
    .map((o) => ({ o, s: score(o), d: days(o) }))
    .sort((a, b) => b.s - a.s || a.d - b.d || a.o.slug.localeCompare(b.o.slug))
    .slice(0, n)
    .map((x) => x.o);
}

/** Einzeiler mit Eckdaten für Listen */
function listRow(p: Piece, l: Locale, c: LibraryCopy, withLevel = true): string {
  // geschätzte Tonarten nur auf der Stückseite (dort gekennzeichnet), nicht in Listen
  const known = !!p.stats.key && p.stats.key.source !== 'estimated';
  const vars = {
    duration: clock(p.stats.durationSec),
    meter: p.stats.timeSignature,
    key: known ? keyName(p.stats.key!, l) : '',
    level: withLevel && p.level !== null ? fmt(c.list.rowLevel, { level: p.level }) : '',
  };
  return fmt(known ? c.list.row : c.list.rowNoKey, vars);
}

function pieceList(
  pieces: readonly Piece[],
  l: Locale,
  c: LibraryCopy,
  opts: { level?: boolean; composer?: boolean } = {},
): string {
  return `<ul class="pieces">${pieces
    .map(
      (p) =>
        `<li><a href="${piecePath(p, l)}">${esc(p.titles[l])}</a>${opts.composer ? ` <span class="by">– ${esc(p.composers[l].name)}</span>` : ''}<span class="row">${esc(listRow(p, l, c, opts.level ?? true))}</span></li>`,
    )
    .join('')}</ul>`;
}

const W = (html: string) => `<!--words-->${html}<!--/words-->`;

/* ── Stückseite ─────────────────────────────────── */

function piecePage(p: Piece, l: Locale, all: readonly Piece[], g: Groups, content: ContentLookup): SitePage {
  const c = libraryCopy(l);
  const s = p.stats;
  const title = p.titles[l];
  const seed = `${p.slug}:${l}`;
  const key = s.key ? keyName(s.key, l) : '';
  const low = noteName(s.lowest, s.key, l);
  const high = noteName(s.highest, s.key, l);
  const vars = {
    title,
    composer: p.composers[l].name,
    last: p.composers[l].short,
    duration: clock(s.durationSec),
    tempo: s.tempoBpm,
    meter: s.timeSignature,
    notes: num(s.notes, l),
    right: num(s.notesRight, l),
    left: num(s.notesLeft, l),
    bars: s.bars,
    key,
    low,
    high,
    span: s.highest - s.lowest,
    level: p.level ?? '',
    levelName: p.level !== null ? levelName(p.level, l) : '',
  };
  const t = (tpl: string, extra: Record<string, string | number> = {}) =>
    esc(fmt(tpl, { ...vars, ...extra }));
  const aliases = aliasesFor(p, l);

  // Einleitung: Variante + Daten-Sätze
  const facts1 = [t(pick(c.piece.lead, `${seed}:lead`))];
  if (s.key)
    facts1.push(
      t(
        s.key.source === 'file'
          ? c.piece.keyFile
          : s.key.source === 'catalog'
            ? c.piece.keyCatalog
            : c.piece.keyEstimated,
      ),
    );
  if (s.tempoRange) facts1.push(t(c.piece.tempoChanges, { min: s.tempoRange[0], max: s.tempoRange[1] }));
  if (s.timeSignatureChanges) facts1.push(t(c.piece.meterChanges));
  const facts2 = [t(c.piece.range)];
  facts2.push(
    t(s.hands === 'both' ? c.piece.handsBoth : s.hands === 'right' ? c.piece.handsRight : c.piece.handsLeft),
  );
  if (aliases.length)
    facts2.push(
      t(c.piece.aliases, {
        aliases: joinList(
          aliases.map((a) => quote(a, l)),
          orWord(l),
        ),
      }),
    );
  if (p.collection) facts2.push(t(c.piece.collection, { collection: p.collection }));
  if (p.level !== null) facts2.push(t(c.piece.level));

  const appHref = appPath(l, p.slug);
  const rollAlt = fmt(c.piece.rollAlt, vars);

  const factRows: [string, string][] = [
    [c.piece.facts.composer, `<a href="${composerHref(g, p, l)}">${esc(p.composers[l].name)}</a>`],
    [c.piece.facts.duration, t(c.piece.durationValue)],
    [
      c.piece.facts.tempo,
      s.tempoRange
        ? t(c.piece.tempoRangeValue, { min: s.tempoRange[0], max: s.tempoRange[1] })
        : t(c.piece.tempoValue),
    ],
  ];
  if (s.key)
    factRows.push([
      c.piece.facts.key,
      esc(key) + (s.key.source === 'estimated' ? ` (${esc(c.piece.estimated)})` : ''),
    ]);
  factRows.push(
    [c.piece.facts.meter, esc(s.timeSignature)],
    [c.piece.facts.bars, String(s.bars)],
    [c.piece.facts.notes, s.hands === 'both' ? t(c.piece.notesValue) : esc(vars.notes)],
    [c.piece.facts.range, `${esc(low)}–${esc(high)}`],
    [c.piece.facts.hands, esc(c.piece.handsValue[s.hands])],
  );
  if (p.level !== null)
    factRows.push([
      c.piece.facts.level,
      `<a href="${levelPath(p.level, l)}">${p.level} (${esc(vars.levelName)})</a>`,
    ]);
  if (p.collection)
    factRows.push([
      c.piece.facts.collection,
      hasCollectionPage(g, p.collectionSlug)
        ? `<a href="${collectionPath(p.collectionSlug!, l)}">${esc(p.collection)}</a>`
        : esc(p.collection),
    ]);
  factRows.push([c.piece.facts.added, `<time datetime="${p.added}">${p.added}</time>`]);

  const practice = [
    pick(c.piece.wait, `${seed}:wait`),
    pick(c.piece.loop, `${seed}:loop`),
    pick(c.piece.tempo, `${seed}:tempo`),
    pick(c.piece.performance, `${seed}:perf`),
    c.piece.colors,
  ].map((x) => `<p>${t(x)}</p>`);

  const md = content('pieces', p.slug, l);
  const e = p.entry;
  const licenseHtml = e.license_url
    ? `<a href="${esc(e.license_url)}" rel="license noopener">${esc(e.license)}</a>`
    : esc(e.license);

  const related = relatedPieces(p, all);
  const moreLinks = [
    `<li><a href="${composerHref(g, p, l)}">${t(hasComposerPage(g, p.composerSlug) ? c.piece.composerLink : c.piece.composerOverviewLink)}</a></li>`,
  ];
  if (hasCollectionPage(g, p.collectionSlug))
    moreLinks.push(
      `<li><a href="${collectionPath(p.collectionSlug!, l)}">${t(c.piece.collectionLink, { collection: p.collection! })}</a></li>`,
    );
  if (p.level !== null)
    moreLinks.push(`<li><a href="${levelPath(p.level, l)}">${t(c.piece.levelLink)}</a></li>`);

  const main = [
    W(`<p class="lead">${facts1.join(' ')}</p>\n<p>${facts2.join(' ')}</p>`),
    `<p class="actions"><a class="button" href="${appHref}">${esc(c.piece.open)}</a> <a class="download" href="${midiPath(p)}" download>${t(c.piece.download, { size: Math.max(1, Math.round(p.fileBytes / 1024)) })}</a></p>`,
    `<figure class="roll"><img src="${rollSvgPath(p)}" alt="${esc(rollAlt)}" width="${ROLL_W}" height="${ROLL_H}" decoding="async" /><figcaption>${esc(c.piece.rollCaption)}</figcaption></figure>`,
    W(
      `<section><h2>${esc(c.piece.factsH2)}</h2><dl class="facts">${factRows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl></section>`,
    ),
    W(`<section><h2>${t(c.piece.practiceH2)}</h2>${practice.join('')}</section>`),
    md ? W(`<section class="prose"><h2>${esc(c.piece.aboutH2)}</h2>${markdown(md)}</section>`) : '',
    W(
      `<section><h2>${esc(c.piece.licenseH2)}</h2><p>${fmt(esc(c.piece.license), { license: licenseHtml })}</p>${e.credit ? `<p>${t(c.piece.credit, { credit: e.credit })}</p>` : ''}</section>`,
    ),
    `<nav class="more" aria-labelledby="rel-h"><h2 id="rel-h">${esc(c.piece.relatedH2)}</h2>${pieceList(
      related,
      l,
      c,
      {
        composer: true,
      },
    )}<ul class="links">${moreLinks.join('')}</ul></nav>`,
  ]
    .filter(Boolean)
    .join('\n');

  // Description: stückspezifische Sätze, bis 120–160 Zeichen erreicht sind
  const d = c.piece.desc;
  const description = fitDescription([
    fmt(s.key && s.key.source !== 'estimated' ? d.core : d.coreNoKey, vars),
    p.level !== null ? fmt(d.level, vars) : null,
    aliases[0] ? fmt(d.alias, { alias: quote(aliases[0], l) }) : null,
    fmt(d.wait, vars),
    s.hands === 'both' ? fmt(d.hands, vars) : null,
    fmt(d.tempo, vars),
    fmt(d.free, vars),
  ]);

  const jsonLd: Record<string, unknown> = {
    '@type': 'MusicComposition',
    name: title,
    ...(aliases.length ? { alternateName: aliases } : {}),
    composer: { '@type': 'Person', name: p.composers[l].name },
    inLanguage: l,
    ...(s.key && s.key.source !== 'estimated' ? { musicalKey: schemaKey(s.key) } : {}),
    license: e.license_url ?? e.license,
    creditText: e.credit ?? e.license,
    ...(p.collection ? { isPartOf: { '@type': 'CreativeWork', name: p.collection } } : {}),
  };

  return {
    id: `piece:${p.slug}`,
    kind: 'piece',
    locale: l,
    path: piecePath(p, l),
    // „Menuett (vereinfacht) (Petzold)“ vermeiden: endet der Titel auf eine Klammer, „– Petzold“ statt „(Petzold)“
    titleCandidates: c.piece.titles.map((x) =>
      fmt(title.endsWith(')') ? x.replace('({last})', '– {last}') : x, vars),
    ),
    title: '',
    description,
    h1: fmt(c.piece.h1, vars),
    crumbs: [
      { name: c.nav.home, path: localizedPath('home', l) },
      { name: c.nav.library, path: overviewPath(l) },
      { name: title, path: piecePath(p, l) },
    ],
    main,
    words: 0,
    indexable: true,
    hreflang: false,
    lastmod: p.lastmod,
    image: { path: rollPngPath(p), alt: rollAlt, width: ROLL_W, height: ROLL_H, type: 'image/png' },
    jsonLd: [jsonLd],
    appHref,
    piece: p,
  };
}

/* ── Listenseiten ───────────────────────────────── */

/** Description mit so vielen Titeln wie passen */
function listDescription(
  tpl: string,
  vars: Record<string, string | number>,
  pieces: readonly Piece[],
  l: Locale,
  extra: string[],
): string {
  const titles = pieces.map((p) => p.titles[l]);
  let best = fmt(tpl, { ...vars, list: titles[0] ?? '' });
  for (let n = 1; n <= titles.length; n++) {
    const more = n < titles.length;
    const list =
      joinList(titles.slice(0, n), more ? ',' : andWord(l)).replace(/ , /g, ', ') + (more ? ' …' : '');
    const text = fmt(tpl, { ...vars, list });
    if (text.length > 160) break;
    best = text;
  }
  return fitDescription([best, ...extra]);
}

/** „1 Stück“ / „3 Stücke“ */
const piecesWord = (n: number, l: Locale) =>
  n === 1 ? libraryCopy(l).list.piecesOne : fmt(libraryCopy(l).list.pieces, { count: num(n, l) });

const sum = (pieces: readonly Piece[], f: (p: Piece) => number) => pieces.reduce((a, p) => a + f(p), 0);

function keysOf(pieces: readonly Piece[], l: Locale): string {
  const names = [
    ...new Set(
      pieces
        .filter((p) => p.stats.key && p.stats.key.source !== 'estimated')
        .map((p) => keyName(p.stats.key!, l)),
    ),
  ];
  return names.join(', ');
}

function listPage(
  kind: 'composer' | 'collection' | 'level',
  id: string,
  l: Locale,
  path: string,
  pieces: Piece[],
  copy: { titles: string[]; h1: string; desc: string; listH2: string },
  vars: Record<string, string | number>,
  introParts: string[],
  extraHtml: string,
): SitePage {
  const c = libraryCopy(l);
  const sorted = [...pieces].sort(byTitle(l));
  const h1 = fmt(copy.h1, vars);
  const main = [
    W(`<p class="lead">${introParts.map(esc).join(' ')}</p>${extraHtml}`),
    W(
      `<section><h2>${esc(fmt(copy.listH2, vars))}</h2>${pieceList(sorted, l, c, { level: kind !== 'level', composer: kind !== 'composer' })}</section>`,
    ),
  ].join('\n');
  return {
    id,
    kind,
    locale: l,
    path,
    titleCandidates: copy.titles.map((x) => fmt(x, vars)),
    title: '',
    description: listDescription(copy.desc, vars, sorted, l, [...introParts, c.piece.desc.free]),
    h1,
    crumbs: [
      { name: c.nav.home, path: localizedPath('home', l) },
      { name: c.nav.library, path: overviewPath(l) },
      { name: String(vars.crumb ?? h1), path },
    ],
    main,
    words: 0,
    indexable: true,
    hreflang: false,
    lastmod: pieces.reduce((m, p) => (p.lastmod > m ? p.lastmod : m), ''),
    image: null,
    jsonLd: [],
    appHref: appPath(l),
  };
}

function composerPage(gr: ComposerGroup, l: Locale, content: ContentLookup): SitePage {
  const c = libraryCopy(l);
  const ps = gr.pieces;
  const durations = ps.map((p) => p.stats.durationSec);
  const vars = {
    composer: gr.names[l].name,
    count: ps.length,
    total: minutes(
      sum(ps, (p) => p.stats.durationSec),
      l,
    ),
    shortest: clock(Math.min(...durations)),
    longest: clock(Math.max(...durations)),
    notes: num(
      sum(ps, (p) => p.stats.notes),
      l,
    ),
    crumb: gr.names[l].name,
  };
  const intro = [fmt(c.composer.intro, vars)];
  const keys = keysOf(ps, l);
  if (keys) intro.push(fmt(c.composer.keys, { keys }));
  const levels = [...new Set(ps.map((p) => p.level).filter((x): x is number => x !== null))].sort();
  if (levels.length)
    intro.push(fmt(c.composer.levels, { levels: levels.map((n) => `${n} (${levelName(n, l)})`).join(', ') }));
  const md = content('composers', gr.slug, l);
  return listPage(
    'composer',
    `composer:${gr.slug}`,
    l,
    composerPath(gr.slug, l),
    ps,
    c.composer,
    vars,
    intro,
    md ? `<div class="prose">${markdown(md)}</div>` : '',
  );
}

function collectionPage(gr: Group, l: Locale): SitePage {
  const c = libraryCopy(l);
  const ps = gr.pieces;
  const vars = {
    collection: gr.name,
    count: ps.length,
    total: minutes(
      sum(ps, (p) => p.stats.durationSec),
      l,
    ),
    notes: num(
      sum(ps, (p) => p.stats.notes),
      l,
    ),
    crumb: gr.name,
  };
  const intro = [fmt(c.collection.intro, vars)];
  const composers = [...new Set(ps.map((p) => p.composers[l].name))];
  intro.push(fmt(c.collection.composers, { composers: joinList(composers, andWord(l)) }));
  return listPage(
    'collection',
    `collection:${gr.slug}`,
    l,
    collectionPath(gr.slug, l),
    ps,
    c.collection,
    vars,
    intro,
    '',
  );
}

function levelPage(level: number, ps: Piece[], l: Locale): SitePage {
  const c = libraryCopy(l);
  const tempos = ps.map((p) => p.stats.tempoBpm);
  const vars = {
    level,
    levelName: levelName(level, l),
    count: ps.length,
    pieces: piecesWord(ps.length, l),
    composers: (() => {
      const names = [...new Set(ps.map((p) => p.composers[l].short))].sort((a, b) => a.localeCompare(b, l));
      const shown = names.slice(0, 5);
      return names.length > 5
        ? `${shown.join(', ')} ${l === 'de' ? 'u. a.' : 'and others'}`
        : joinList(shown, andWord(l));
    })(),
    total: minutes(
      sum(ps, (p) => p.stats.durationSec),
      l,
    ),
    minTempo: Math.min(...tempos),
    maxTempo: Math.max(...tempos),
    crumb: `${fmt(c.level.name, { level })} (${levelName(level, l)})`,
  };
  const intro = [fmt(c.level.intro, vars)];
  const keys = keysOf(ps, l);
  if (keys) intro.push(fmt(c.level.keys, { keys }));
  return listPage('level', `level:${level}`, l, levelPath(level, l), ps, c.level, vars, intro, '');
}

/* ── Übersicht ─────────────────────────────────── */

function overviewPage(pieces: readonly Piece[], g: Groups, l: Locale): SitePage {
  const c = libraryCopy(l);
  const o = c.overview;
  const composers = [...g.composers.values()].sort(
    (a, b) =>
      a.names[l].short.localeCompare(b.names[l].short, l) ||
      a.names[l].name.localeCompare(b.names[l].name, l),
  );
  const top = [...g.composers.values()]
    .sort((a, b) => b.pieces.length - a.pieces.length)
    .slice(0, 3)
    .map((x) => x.names[l].short);
  const vars = {
    count: pieces.length,
    composerCount: g.composers.size,
    total: minutes(
      sum(pieces, (p) => p.stats.durationSec),
      l,
    ),
    composers: joinList(top, andWord(l)),
  };
  const levels = [...g.levels.keys()].sort((a, b) => a - b);
  const collections = [...g.collections.values()]
    .filter((x) => hasCollectionPage(g, x.slug))
    .sort((a, b) => a.name.localeCompare(b.name, l));
  const latest = pieces.slice(0, config.latestOnOverview);

  const sections: string[] = [];
  sections.push(W(`<p class="lead">${esc(o.intro)}</p><p>${esc(fmt(o.stats, vars))}</p>`));
  sections.push(
    `<form class="search" role="search" hidden><label for="q">${esc(o.search)}</label><input id="q" type="search" placeholder="${esc(o.searchPlaceholder)}" autocomplete="off" /></form>`,
  );
  sections.push(
    W(`<section><h2>${esc(o.newH2)}</h2>${pieceList(latest, l, c, { composer: true })}</section>`),
  );
  if (levels.length)
    sections.push(
      W(
        `<section><h2>${esc(o.levelsH2)}</h2><ul class="tiles">${levels
          .map(
            (n) =>
              `<li><a href="${levelPath(n, l)}">${esc(fmt(o.levelItem, { level: n, levelName: levelName(n, l), pieces: piecesWord(g.levels.get(n)!.length, l) }))}</a></li>`,
          )
          .join('')}</ul></section>`,
      ),
    );
  if (collections.length)
    sections.push(
      W(
        `<section><h2>${esc(o.collectionsH2)}</h2><ul class="tiles">${collections
          .map(
            (x) =>
              `<li><a href="${collectionPath(x.slug, l)}">${esc(fmt(o.collectionItem, { collection: x.name, pieces: piecesWord(x.pieces.length, l) }))}</a></li>`,
          )
          .join('')}</ul></section>`,
      ),
    );
  sections.push(
    W(
      `<section id="all"><h2>${esc(o.composersH2)}</h2>${composers
        .map((x) => {
          const head = hasComposerPage(g, x.slug)
            ? `<h3 id="c-${x.slug}"><a href="${composerPath(x.slug, l)}">${esc(x.names[l].name)}</a></h3>`
            : `<h3 id="c-${x.slug}">${esc(x.names[l].name)}</h3>`;
          const items = [...x.pieces]
            .sort(byTitle(l))
            .map(
              (p) =>
                `<li data-s="${esc([p.titles.en, p.titles.de, p.composers.en.name, p.composers.de.name, ...p.aliases].join(' ').toLowerCase())}"><a href="${piecePath(p, l)}">${esc(p.titles[l])}</a><span class="row">${esc(listRow(p, l, c))}</span></li>`,
            )
            .join('');
          return `<div class="composer">${head}<ul class="pieces">${items}</ul></div>`;
        })
        .join('')}</section>`,
    ),
  );
  sections.push(`<p><a href="${localizedPath('libraryFeed', l)}">${esc(o.feed)}</a></p>`);
  // Suche nur als Zusatz: ohne JS bleibt alles als Liste sichtbar
  sections.push(`<script>
(() => {
  const f = document.querySelector('.search'), q = document.getElementById('q');
  if (!f || !q) return;
  f.hidden = false;
  f.addEventListener('submit', (e) => e.preventDefault());
  q.addEventListener('input', () => {
    const v = q.value.trim().toLowerCase();
    document.querySelectorAll('#all .composer').forEach((box) => {
      let any = false;
      box.querySelectorAll('li[data-s]').forEach((li) => {
        const hit = !v || li.dataset.s.includes(v) || box.querySelector('h3').textContent.toLowerCase().includes(v);
        li.hidden = !hit;
        any = any || hit;
      });
      box.hidden = !any;
    });
  });
})();
</script>`);

  return {
    id: 'overview',
    kind: 'overview',
    locale: l,
    path: overviewPath(l),
    titleCandidates: [o.title],
    title: '',
    description: fitDescription([fmt(o.desc, vars), fmt(o.stats, vars)]),
    h1: o.h1,
    crumbs: [
      { name: c.nav.home, path: localizedPath('home', l) },
      { name: c.nav.library, path: overviewPath(l) },
    ],
    main: sections.join('\n'),
    words: 0,
    indexable: true,
    hreflang: false,
    lastmod: pieces.reduce((m, p) => (p.lastmod > m ? p.lastmod : m), ''),
    image: null,
    jsonLd: [],
    appHref: appPath(l),
  };
}

/* ── Alle Seiten ───────────────────────────────── */

export function buildPages(
  pieces: readonly Piece[],
  content: ContentLookup,
): { pages: SitePage[]; groups: Groups } {
  const g = groupPieces(pieces);
  const pages: SitePage[] = [];
  for (const l of PAGE_LOCALES) {
    pages.push(overviewPage(pieces, g, l));
    for (const p of pieces) pages.push(piecePage(p, l, pieces, g, content));
    for (const x of g.composers.values())
      if (hasComposerPage(g, x.slug)) pages.push(composerPage(x, l, content));
    for (const x of g.collections.values())
      if (hasCollectionPage(g, x.slug)) pages.push(collectionPage(x, l));
    for (const [n, ps] of g.levels) pages.push(levelPage(n, ps, l));
  }

  // Wortzahl → noindex
  for (const page of pages) {
    const counted = [...page.main.matchAll(/<!--words-->([\s\S]*?)<!--\/words-->/g)]
      .map((m) => m[1])
      .join(' ');
    page.words = wordCount(htmlText(counted));
    page.indexable = page.words >= config.minWords;
  }
  // hreflang nur, wenn alle Sprachfassungen indexierbar sind
  const byId = new Map<string, SitePage[]>();
  for (const page of pages) byId.set(page.id, [...(byId.get(page.id) ?? []), page]);
  for (const group of byId.values()) {
    const ok = group.length === PAGE_LOCALES.length && group.every((x) => x.indexable);
    for (const page of group) page.hreflang = ok;
  }
  resolveTitles(pages);
  return { pages, groups: g };
}

/** Eindeutige Titel je Sprache: erster passender Kandidat; bei Gleichstand der nächste, der eindeutig ist */
export function resolveTitles(pages: SitePage[]): void {
  const fits = new Map(pages.map((p) => [p, fittingTitles(p.titleCandidates)]));
  for (const p of pages) p.title = fits.get(p)![0]!;
  for (let round = 0; round < 6; round++) {
    const seen = new Map<string, SitePage[]>();
    for (const p of pages) {
      const k = `${p.locale}\n${p.title}`;
      seen.set(k, [...(seen.get(k) ?? []), p]);
    }
    let changed = false;
    for (const dupes of seen.values()) {
      if (dupes.length < 2) continue;
      const used = new Set(pages.filter((p) => p.locale === dupes[0]!.locale).map((p) => p.title));
      for (const p of dupes.slice(1)) {
        const next = fits.get(p)!.find((t) => !used.has(t));
        if (next) {
          used.add(next);
          p.title = next;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/* ── HTML ──────────────────────────────────────── */

export interface LayoutContext {
  siteUrl: string;
  cssHref: string;
  /** Sprachfassungen je Seiten-ID */
  byId: Map<string, Map<Locale, SitePage>>;
  footer: Record<Locale, string>;
}

const jsonScript = (data: unknown) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

export function footerHtml(g: Groups, l: Locale): string {
  const c = libraryCopy(l);
  const f = c.footer;
  const levels = [...g.levels.keys()].sort((a, b) => a - b);
  const composers = [...g.composers.values()]
    .filter((x) => hasComposerPage(g, x.slug))
    .sort((a, b) => b.pieces.length - a.pieces.length)
    .slice(0, 12);
  const collections = [...g.collections.values()]
    .filter((x) => hasCollectionPage(g, x.slug))
    .sort((a, b) => b.pieces.length - a.pieces.length)
    .slice(0, 12);
  const col = (h: string, items: string[]) =>
    items.length ? `<div><h2>${esc(h)}</h2><ul>${items.join('')}</ul></div>` : '';
  return `<footer class="site-footer"><div class="cols">${[
    col(f.libraryH, [
      `<li><a href="${overviewPath(l)}">${esc(f.overview)}</a></li>`,
      `<li><a href="${localizedPath('libraryFeed', l)}">${esc(f.feed)}</a></li>`,
      `<li><a href="${localizedPath('home', l)}">${esc(f.home)}</a></li>`,
    ]),
    col(
      f.levelsH,
      levels.map((n) => `<li><a href="${levelPath(n, l)}">${n} · ${esc(levelName(n, l))}</a></li>`),
    ),
    col(
      f.composersH,
      composers.map((x) => `<li><a href="${composerPath(x.slug, l)}">${esc(x.names[l].name)}</a></li>`),
    ),
    col(
      f.collectionsH,
      collections.map((x) => `<li><a href="${collectionPath(x.slug, l)}">${esc(x.name)}</a></li>`),
    ),
  ].join('')}</div><p class="note">${esc(f.note)}</p></footer>`;
}

export function layout(page: SitePage, ctx: LayoutContext): string {
  const l = page.locale;
  const c = libraryCopy(l);
  const abs = (path: string) => ctx.siteUrl + path;
  const versions = ctx.byId.get(page.id)!;
  const others = PAGE_LOCALES.filter((x) => x !== l);
  const image = page.image ?? {
    path: '/og-image.png',
    alt: '',
    width: 1200,
    height: 630,
    type: 'image/png',
  };
  const breadcrumbLd = {
    '@type': 'BreadcrumbList',
    itemListElement: page.crumbs.map((cr, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: cr.name,
      item: abs(cr.path),
    })),
  };
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbLd, ...page.jsonLd.map((x) => ({ ...x, url: abs(page.path) }))],
  };
  const head = [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${page.indexable ? 'index, follow' : 'noindex, follow'}" />`,
    `<link rel="canonical" href="${esc(abs(page.path))}" />`,
    ...(page.hreflang
      ? [
          ...PAGE_LOCALES.map(
            (x) =>
              `<link rel="alternate" hreflang="${LOCALE_INFO[x].hreflang}" href="${esc(abs(versions.get(x)!.path))}" />`,
          ),
          `<link rel="alternate" hreflang="x-default" href="${esc(abs(versions.get(DEFAULT_LOCALE)!.path))}" />`,
        ]
      : []),
    `<link rel="alternate" type="application/atom+xml" title="${esc(c.feed.title)}" href="${localizedPath('libraryFeed', l)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Pianist" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${esc(abs(page.path))}" />`,
    `<meta property="og:image" content="${esc(abs(image.path))}" />`,
    `<meta property="og:image:type" content="${image.type}" />`,
    `<meta property="og:image:width" content="${image.width}" />`,
    `<meta property="og:image:height" content="${image.height}" />`,
    ...(image.alt ? [`<meta property="og:image:alt" content="${esc(image.alt)}" />`] : []),
    `<meta property="og:locale" content="${LOCALE_INFO[l].ogLocale}" />`,
    ...others.map((x) => `<meta property="og:locale:alternate" content="${LOCALE_INFO[x].ogLocale}" />`),
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">\n${jsonScript(ld)}\n</script>`,
  ].join('\n    ');

  const crumbs = page.crumbs
    .map((cr, i) =>
      i === page.crumbs.length - 1
        ? `<li aria-current="page">${esc(cr.name)}</li>`
        : `<li><a href="${cr.path}">${esc(cr.name)}</a></li>`,
    )
    .join('');
  const langLinks = others
    .map(
      (x) =>
        `<a href="${versions.get(x)!.path}" hreflang="${x}" lang="${x}">${esc(libraryCopy(x).langName)}</a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="${l}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${head}
    <meta name="theme-color" content="#0b0605" />
    <meta name="color-scheme" content="dark" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="${ctx.cssHref}" />
  </head>
  <body class="lib lib-${page.kind}">
    <header class="site-header">
      <a class="wordmark" href="${localizedPath('home', l)}"><img src="/favicon.svg" alt="" width="22" height="22" />Pianist</a>
      <nav aria-label="${esc(c.nav.library)}">
        <a href="${overviewPath(l)}">${esc(c.nav.library)}</a>
        <span class="lang" role="group" aria-label="${esc(c.nav.langLabel)}">${langLinks}</span>
        <a class="cta" href="${page.kind === 'piece' ? page.appHref : appPath(l)}">${esc(c.nav.openApp)}</a>
      </nav>
    </header>
    <nav class="crumbs" aria-label="${esc(c.nav.breadcrumb)}"><ol>${crumbs}</ol></nav>
    <main>
      <h1>${esc(page.h1)}</h1>
${page.main}
    </main>
    ${ctx.footer[l]}
  </body>
</html>
`;
}
