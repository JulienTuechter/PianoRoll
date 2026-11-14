import { useRef } from 'react';
import { useCopy } from '../i18n';
import { GITHUB_URL } from '../links';

/** Kleine Linien-Glyphen für die Ausstattung (inline SVG, erben die Textfarbe) */
const GLYPHS = [
  // MIDI-Buchse
  <svg key="midi" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="17" />
    <circle cx="14" cy="22" r="2" />
    <circle cx="34" cy="22" r="2" />
    <circle cx="17" cy="30" r="2" />
    <circle cx="31" cy="30" r="2" />
    <circle cx="24" cy="33" r="2" />
    <path d="M21 8h6v4h-6z" />
  </svg>,
  // Tastatur
  <svg key="keys" viewBox="0 0 48 48" aria-hidden="true">
    <rect x="5" y="14" width="38" height="22" rx="3" />
    <path d="M10 20h4M17 20h4M24 20h4M31 20h4M10 26h4M17 26h4M24 26h4M31 26h4M14 31h20" />
  </svg>,
  // Loop
  <svg key="loop" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M14 18h18a8 8 0 0 1 0 16h-4M34 30H16a8 8 0 0 1 0-16h4" />
    <path d="M30 14l4 4-4 4M18 26l-4 4 4 4" />
  </svg>,
  // Bibliothek
  <svg key="lib" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M10 10v28M17 10v28M24 12l8 26M36 10v28" />
  </svg>,
  // Auge
  <svg key="eye" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M5 24c5-9 12-13 19-13s14 4 19 13c-5 9-12 13-19 13S10 33 5 24z" />
    <circle cx="24" cy="24" r="6" />
  </svg>,
  // Quellcode
  <svg key="code" viewBox="0 0 48 48" aria-hidden="true">
    <path d="M17 15L7 24l10 9M31 15l10 9-10 9M27 11l-6 26" />
  </svg>,
];

/** Ausstattung als Lichtpult: jede Karte hat einen eigenen Spot, der dem Zeiger folgt. */
export function Rig() {
  const c = useCopy();
  const gridRef = useRef<HTMLUListElement>(null);

  const onMove = (e: React.PointerEvent<HTMLUListElement>) => {
    for (const card of gridRef.current?.children ?? []) {
      const r = card.getBoundingClientRect();
      (card as HTMLElement).style.setProperty('--x', `${e.clientX - r.left}px`);
      (card as HTMLElement).style.setProperty('--y', `${e.clientY - r.top}px`);
    }
  };

  return (
    <section className="rig" id="backstage">
      <div className="demo-head">
        <p className="kicker">{c.rig.kicker}</p>
        <h2>{c.rig.title}</h2>
      </div>
      <ul className="rig-grid" ref={gridRef} onPointerMove={onMove}>
        {c.rig.items.map((it, i) => (
          <li key={i} className="rig-card" style={{ '--i': i } as React.CSSProperties}>
            <span className="rig-glyph">{GLYPHS[i]}</span>
            <h3>{it.t}</h3>
            <p>{it.d}</p>
            {i === c.rig.items.length - 1 && (
              <a className="rig-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                {c.github} <span aria-hidden="true">↗</span>
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
