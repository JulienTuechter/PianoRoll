/** Textwerkzeuge: Varianten wählen, Title/Description einpassen, Wörter zählen, kleines Markdown. */

export { fmt } from '../../src/i18n/landing';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Stabiler Hash (FNV-1a), damit jede Seite bei jedem Build dieselbe Variante bekommt */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(variants: readonly T[], seed: string): T {
  return variants[hash(seed) % variants.length]!;
}

export const TITLE_MAX = 60;
export const DESC_MIN = 120;
export const DESC_MAX = 160;

/** Kürzt an einer Wortgrenze (nie mitten im Wort) */
export function cutAtWord(text: string, max: number, ellipsis = '…'): string {
  if (text.length <= max) return text;
  const room = max - ellipsis.length;
  const cut = text.slice(0, room + 1);
  const at = cut.search(/\s\S*$/);
  return (at > 0 ? cut.slice(0, at) : text.slice(0, room)).replace(/[\s,;:–-]+$/, '') + ellipsis;
}

/** Titel-Kandidaten, die in TITLE_MAX passen (in Reihenfolge); notfalls der letzte an einer Wortgrenze gekürzt */
export function fittingTitles(candidates: readonly string[], max = TITLE_MAX): string[] {
  const fits = [...new Set(candidates.map((c) => c.replace(/\s+/g, ' ').trim()))].filter(
    (c) => c.length <= max,
  );
  if (fits.length) return fits;
  return [cutAtWord(candidates[candidates.length - 1]!, max)];
}

/**
 * Description aus Sätzen: der erste ist Pflicht, die weiteren kommen in Reihenfolge dazu, solange
 * höchstens DESC_MAX Zeichen herauskommen. Ziel: DESC_MIN–DESC_MAX.
 */
export function fitDescription(parts: readonly (string | null | undefined)[]): string {
  const list = parts.filter((p): p is string => !!p && p.trim().length > 0).map((p) => p.trim());
  let out = list[0] ?? '';
  if (out.length > DESC_MAX) return cutAtWord(out, DESC_MAX);
  for (const p of list.slice(1)) {
    if (out.length >= DESC_MIN && out.length + 1 + p.length > DESC_MAX) continue;
    if (out.length + 1 + p.length <= DESC_MAX) out += ` ${p}`;
  }
  return out;
}

/** Sichtbarer Text aus HTML (für Wortzählung) */
export function htmlText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, 'x')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wörter: Folgen mit mindestens einem Buchstaben oder einer Ziffer */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Aufzählung: „a, b und c“ / „a, b or c“ */
export function joinList(items: readonly string[], last: string): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}`;
}

/**
 * Minimales Markdown für handgeschriebene Texte (content/…/*.md): Absätze, ## Überschriften, Listen,
 * **fett**, *kursiv*, [Link](url). HTML im Text wird maskiert. Überschriften beginnen bei h2.
 */
export function markdown(md: string): string {
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, '').replace(/\r\n/g, '\n');
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
        const safe = /^(https?:\/\/|\/|#|mailto:)/.test(href) ? href : '#';
        const ext = /^https?:\/\//.test(safe) ? ' rel="noopener"' : '';
        return `<a href="${safe}"${ext}>${text}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const out: string[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.trim().split('\n');
    if (!lines[0]) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(lines[0]);
    if (h && lines.length === 1) {
      const level = Math.min(4, Math.max(2, h[1]!.length));
      out.push(`<h${level}>${inline(h[2]!)}</h${level}>`);
    } else if (lines.every((l) => /^[-*]\s+/.test(l))) {
      out.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`);
    } else out.push(`<p>${inline(lines.join(' '))}</p>`);
  }
  return out.join('\n');
}
