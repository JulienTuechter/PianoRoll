import { useEffect, useMemo, useRef, useState } from 'react';
import { buildNotation } from '../../core/notation-builder/notation';
import { normalizeLoop, type LoopRange } from '../../core/practice-engine/loop';
import { firstNoteIndexAtOrAfter } from '../../core/note-event-model/notes';
import { cursorAt, renderScore, type ScoreLayout } from '../notation/render-score';
import { live, seekToMeasure, setLoop, transport } from '../runtime';
import { useApp } from '../store/app-store';
import { useHarmony } from '../store/harmony-store';

/**
 * Notenschrift des Stücks (Klaviersystem). Cursor läuft synchron mit Wait-/Practice-Modus und scrollt mit.
 * Klick auf einen Takt springt dorthin, Ziehen über mehrere Takte wählt einen Loop.
 */
export function NotationView() {
  const song = useApp((s) => s.song);
  const loop = useApp((s) => s.loop);
  const loopEnabled = useApp((s) => s.loopEnabled);
  const songKey = useHarmony((s) => s.songKey);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState<LoopRange | null>(null);

  const score = useMemo(() => {
    if (!song || live.measures.length === 0) return null;
    const tm = live.tempoMap;
    return buildNotation(live.notes, live.measures, song.ppq, {
      key: songKey,
      secToTick: tm ? (sec) => tm.secToTick(sec) : undefined,
    });
  }, [song, songKey]);

  // Breite des Notenblatts beobachten (entprellt) – nicht die des Scrollbereichs, der hat Innenabstand
  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    let t = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setWidth(Math.floor(el.clientWidth)), 120);
    });
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth));
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  // Rendern
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !score || width < 200) return;
    let cancelled = false;
    renderScore(el, score, width)
      .then((l) => {
        if (!cancelled) {
          setLayout(l);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [score, width]);

  // Cursor, aktueller Takt, klingende Noten, Auto-Scroll – pro Frame direkt im DOM
  useEffect(() => {
    if (!layout) return;
    let raf = 0;
    let lastRow = -1;
    let lit = new Set<SVGElement>();
    const tick = () => {
      const tm = live.tempoMap;
      const pos = transport.position;
      if (tm && cursorRef.current) {
        const t = tm.secToTick(Math.max(0, pos));
        const c = cursorAt(layout.points, t);
        const row = c ? layout.rows[c.row] : undefined;
        if (c && row) {
          const s = cursorRef.current.style;
          s.display = 'block';
          s.transform = `translate(${c.x}px, ${row.y + 18}px)`;
          s.height = `${row.h - 40}px`;
          // aktueller Takt
          const m = layout.measures.find((mb) => mb.row === c.row && t >= mb.startTick && t < mb.endTick);
          if (m && currentRef.current) {
            const cs = currentRef.current.style;
            cs.display = 'block';
            cs.transform = `translate(${m.x}px, ${m.y + 10}px)`;
            cs.width = `${m.w}px`;
            cs.height = `${m.h}px`;
          }
          // Auto-Scroll, sobald eine neue Zeile beginnt (oder die Zeile außer Sicht ist)
          const sc = scrollRef.current;
          if (
            sc &&
            (c.row !== lastRow || row.y < sc.scrollTop || row.y + row.h > sc.scrollTop + sc.clientHeight)
          ) {
            if (row.y < sc.scrollTop || row.y + row.h > sc.scrollTop + sc.clientHeight) {
              sc.scrollTo({
                top: Math.max(0, row.y - 10),
                behavior: transport.state === 'playing' ? 'smooth' : 'auto',
              });
            }
            lastRow = c.row;
          }
        }
      }
      // klingende Noten hervorheben (nur Änderungen anfassen)
      const next = new Set<SVGElement>();
      const notes = live.notes;
      for (let i = firstNoteIndexAtOrAfter(notes, pos - live.maxDurationSec); i < notes.length; i++) {
        const n = notes[i]!;
        if (n.startSec > pos) break;
        if (n.startSec + n.durationSec > pos) for (const el of layout.noteEls.get(n.id) ?? []) next.add(el);
      }
      for (const el of lit) if (!next.has(el)) el.classList.remove('vf-playing');
      for (const el of next) if (!lit.has(el)) el.classList.add('vf-playing');
      lit = next;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      for (const el of lit) el.classList.remove('vf-playing');
    };
  }, [layout]);

  const measureAt = (clientX: number, clientY: number): number | null => {
    const svg = svgRef.current?.getBoundingClientRect();
    if (!svg || !layout) return null;
    const x = clientX - svg.left;
    const y = clientY - svg.top;
    const m = layout.measures.find((mb) => x >= mb.x && x < mb.x + mb.w && y >= mb.y && y < mb.y + mb.h + 20);
    return m ? m.index : null;
  };

  const shownLoop = drag ?? (loop ? normalizeLoop(loop, live.measures.length) : null);
  const loopBoxes =
    layout && shownLoop
      ? layout.measures.filter((m) => m.index >= shownLoop.startMeasure && m.index <= shownLoop.endMeasure)
      : [];

  if (!song) return null;
  return (
    <div className="notation-scroll" ref={scrollRef}>
      <div
        className="notation-paper"
        onPointerDown={(e) => {
          const m = measureAt(e.clientX, e.clientY);
          if (m === null) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ startMeasure: m, endMeasure: m });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const m = measureAt(e.clientX, e.clientY);
          if (m !== null && m !== drag.endMeasure) setDrag({ ...drag, endMeasure: m });
        }}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.startMeasure === drag.endMeasure) seekToMeasure(drag.startMeasure);
          else setLoop(normalizeLoop(drag, live.measures.length), true);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        title="Klick: zum Takt springen. Ziehen: Loop über mehrere Takte"
      >
        <div ref={svgRef} className="notation-svg" />
        <div className="notation-overlay">
          {loopBoxes.map((m) => (
            <div
              key={m.index}
              className={`notation-loop${loopEnabled || drag ? ' on' : ''}`}
              style={{ transform: `translate(${m.x}px, ${m.y + 10}px)`, width: m.w, height: m.h }}
            />
          ))}
          <div ref={currentRef} className="notation-current" />
          <div ref={cursorRef} className="notation-cursor" />
        </div>
        {!layout && !error && <div className="notation-loading">Notenschrift wird gesetzt …</div>}
        {error && <div className="notation-loading">Notenschrift konnte nicht gesetzt werden: {error}</div>}
      </div>
    </div>
  );
}
