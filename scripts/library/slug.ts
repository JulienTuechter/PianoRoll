/** Slugs (stabile URLs) und Weiterleitungen. Reine Funktionen, getestet in slug.test.ts. */

/** Feste Pfadteile unter /library/ und /de/bibliothek/: dürfen keine Stück-Slugs sein */
export const RESERVED_SLUGS = new Set([
  'composer',
  'komponist',
  'collection',
  'sammlung',
  'level',
  'stufe',
  'midi',
  'feed',
  'feed-xml',
  'catalog-json',
  'library-css',
]);

const MAX_SLUG = 60;

/** ASCII-Slug: „Die Zauberflöte“ → „die-zauberfloete“, „Präludium C-Dur BWV 846“ → „praeludium-c-dur-bwv-846“ */
export function slugify(text: string, max = MAX_SLUG): string {
  const ascii = text
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .replace(/ø/gi, 'o')
    .replace(/đ/gi, 'd')
    .replace(/ł/gi, 'l')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  let slug = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length > max) {
    const cut = slug.slice(0, max + 1);
    const at = cut.lastIndexOf('-');
    slug = (at > 10 ? cut.slice(0, at) : slug.slice(0, max)).replace(/-+$/, '');
  }
  return slug;
}

/** Nachname für Titel und Slug: „Wolfgang Amadeus Mozart“ → „Mozart“, „J. S. Bach“ → „Bach“ */
export function composerLastName(composer: string): string {
  const parts = composer.trim().split(/\s+/);
  return parts[parts.length - 1] ?? composer;
}

/** Slug-Vorschlag für ein Stück: Komponist (Nachname) + Titel */
export function pieceSlugBase(composer: string, title: string): string {
  return slugify(`${composerLastName(composer)} ${title}`) || 'stueck';
}

/**
 * Vergibt fehlende Slugs. Bestehende Slugs (slugs.json, Schlüssel = Dateiname) bleiben unverändert,
 * auch wenn sich der Titel ändert. Neue Slugs kollidieren weder mit vergebenen noch mit alten
 * (Weiterleitungs-)Slugs noch mit festen Pfadteilen; bei Kollision wird -2, -3 … angehängt.
 */
export function assignSlugs(
  items: readonly { file: string; composer: string; title: string }[],
  existing: Readonly<Record<string, string>>,
  redirects: Readonly<Record<string, string>>,
): { slugs: Record<string, string>; created: string[] } {
  const slugs: Record<string, string> = { ...existing };
  const taken = new Set([...Object.values(existing), ...Object.keys(redirects), ...RESERVED_SLUGS]);
  const created: string[] = [];
  for (const item of items) {
    if (slugs[item.file]) continue;
    const base = pieceSlugBase(item.composer, item.title);
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    slugs[item.file] = slug;
    taken.add(slug);
    created.push(item.file);
  }
  return { slugs, created };
}

/** Prüft slugs.json: eindeutig, gültiges Format, nicht reserviert */
export function slugProblems(slugs: Readonly<Record<string, string>>): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const [file, slug] of Object.entries(slugs)) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      problems.push(`${file}: Slug „${slug}“ ist kein ASCII-Slug (a–z, 0–9, Bindestrich)`);
    if (RESERVED_SLUGS.has(slug)) problems.push(`${file}: Slug „${slug}“ ist reserviert`);
    const other = seen.get(slug);
    if (other) problems.push(`Slug „${slug}“ doppelt vergeben: ${other} und ${file}`);
    seen.set(slug, file);
  }
  return problems;
}

/**
 * Prüft redirects.json (alter Slug → neuer Slug): keine Schleifen, Ziel existiert am Ende der Kette,
 * alter Slug ist nicht wieder vergeben.
 */
export function redirectProblems(
  redirects: Readonly<Record<string, string>>,
  activeSlugs: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  for (const from of Object.keys(redirects)) {
    if (activeSlugs.has(from))
      problems.push(`Weiterleitung „${from}“: der alte Slug ist wieder einem Stück zugeordnet`);
    const seen = new Set([from]);
    let at = redirects[from]!;
    while (redirects[at] !== undefined) {
      if (seen.has(at)) {
        problems.push(`Weiterleitungsschleife: ${[...seen, at].join(' → ')}`);
        break;
      }
      seen.add(at);
      at = redirects[at]!;
    }
    if (!seen.has(at) && !activeSlugs.has(at))
      problems.push(`Weiterleitung „${from}“ → „${at}“: Ziel ist kein veröffentlichtes Stück`);
  }
  return problems;
}

/** Ketten auflösen (a → b, b → c ⇒ a → c), damit jede Weiterleitung genau ein 301 ist */
export function flattenRedirects(redirects: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const from of Object.keys(redirects)) {
    let to = redirects[from]!;
    const seen = new Set([from]);
    while (redirects[to] !== undefined && !seen.has(to)) {
      seen.add(to);
      to = redirects[to]!;
    }
    out[from] = to;
  }
  return out;
}
