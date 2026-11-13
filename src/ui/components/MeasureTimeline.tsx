import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeLoop, type LoopRange } from '../../core/practice-engine/loop';
import { live, seekToMeasure, setLoop, transport } from '../runtime';
import { useApp } from '../store/app-store';

/**
 * Taktleiste: Klick = zum Takt springen, Ziehen = Loop-Bereich wählen (wird sofort aktiv).
 * Zeigt Position, Loop-Bereich und die Fehler-Heatmap des letzten Durchgangs.
 */
export function MeasureTimeline() {
  const song = useApp((s) => s.song);
  const loop = useApp((s) => s.loop);
  const loopEnabled = useApp((s) => s.loopEnabled);
  const heatmap = useApp((s) => (s.lastResult ? s.lastResult.heatmap : null));
  const barRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<LoopRange | null>(null);

  const measures = useMemo(() => (song ? live.measures : []), [song]);
  const total = song ? Math.max(song.durationSec, 0.001) : 1;
  const maxErr = heatmap ? Math.max(1, ...heatmap) : 1;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (cursorRef.current && song) {
        const pos = Math.max(0, Math.min(total, transport.position));
        cursorRef.current.style.left = `${(pos / total) * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [song, total]);

  if (!song || measures.length === 0) return null;

  const measureAtX = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const sec = ((clientX - rect.left) / rect.width) * total;
    let idx = 0;
    for (const m of measures) if (m.startSec <= sec) idx = m.index;
    return idx;
  };

  const shown = drag ?? (loop ? normalizeLoop(loop, measures.length) : null);
  const endOf = (i: number) => measures[i + 1]?.startSec ?? total;
  const label = loop ? `Takt ${loop.startMeasure + 1}–${loop.endMeasure + 1}` : null;

  return (
    <div className="timeline">
      <div
        ref={barRef}
        className="timeline-bar"
        role="slider"
        aria-label="Takte – klicken zum Springen, ziehen für Loop"
        aria-valuemin={1}
        aria-valuemax={measures.length}
        aria-valuenow={1}
        onPointerDown={(e) => {
          const m = measureAtX(e.clientX);
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({ startMeasure: m, endMeasure: m });
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const m = measureAtX(e.clientX);
          if (m !== drag.endMeasure) setDrag({ ...drag, endMeasure: m });
        }}
        onPointerUp={() => {
          if (!drag) return;
          if (drag.startMeasure === drag.endMeasure) seekToMeasure(drag.startMeasure);
          else setLoop(normalizeLoop(drag, measures.length), true);
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {measures.map((m) => {
          const err = heatmap?.[m.index] ?? 0;
          return (
            <div
              key={m.index}
              className="timeline-cell"
              style={{
                left: `${(m.startSec / total) * 100}%`,
                width: `${((endOf(m.index) - m.startSec) / total) * 100}%`,
                background: err > 0 ? `rgba(255, 92, 92, ${0.2 + 0.6 * (err / maxErr)})` : undefined,
              }}
              title={`Takt ${m.index + 1}${err ? ` – ${err} Fehler` : ''}`}
            >
              {(m.index % 4 === 0 || measures.length <= 24) && <span>{m.index + 1}</span>}
            </div>
          );
        })}
        {shown && (
          <div
            className={`timeline-loop${loopEnabled || drag ? ' on' : ''}`}
            style={{
              left: `${((measures[shown.startMeasure]?.startSec ?? 0) / total) * 100}%`,
              width: `${((endOf(shown.endMeasure) - (measures[shown.startMeasure]?.startSec ?? 0)) / total) * 100}%`,
            }}
          />
        )}
        <div ref={cursorRef} className="timeline-cursor" />
      </div>
      {label && (
        <div className="timeline-loop-label">
          <button
            className={`btn small${loopEnabled ? ' active' : ''}`}
            onClick={() => useApp.getState().set({ loopEnabled: !loopEnabled })}
            title="Loop an/aus (L)"
          >
            ⟲ {label}
          </button>
          <button
            className="btn small"
            onClick={() => setLoop(null)}
            title="Loop-Auswahl entfernen"
            aria-label="Loop entfernen"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
