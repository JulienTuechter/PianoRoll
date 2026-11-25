import { useCopy, useLang } from '../i18n';
import { localizedPath } from '../../../src/i18n/routes';

/** Eintrag aus scripts/library/latest.ts (gleiche Form wie LatestPiece in scripts/pages/types.ts) */
export interface LatestPiece {
  title: string;
  composer: string;
  path: string;
}

/**
 * „Neu in der Bibliothek“: echte Links auf die neuesten Stückseiten, damit jede neue Seite sofort
 * einen Pfad von der Startseite hat. Ohne Stücke (z. B. leerer Katalog) wird nichts gerendert.
 */
export function LibraryNew({ pieces }: { pieces: LatestPiece[] }) {
  const c = useCopy();
  const lang = useLang();
  if (!pieces.length) return null;
  return (
    <section className="library-new" aria-labelledby="library-new-h">
      <h2 id="library-new-h">{c.libraryNew.title}</h2>
      <p>{c.libraryNew.lead}</p>
      <ul>
        {pieces.map((p) => (
          <li key={p.path}>
            <a href={p.path}>
              <span className="t">{p.title}</span>
              <span className="c">{p.composer}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className="library-all" href={localizedPath('library', lang)}>
        {c.libraryNew.all} →
      </a>
    </section>
  );
}
