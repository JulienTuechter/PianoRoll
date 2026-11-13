import { useEffect, useRef } from 'react';
import { formatTime } from '../format';
import { recLive, stopRecording } from '../recording';
import { useApp } from '../store/app-store';

/** Anzeige während der Aufnahme: Einzählen (große Ziffer), danach REC-Zeit, Takt und Notenanzahl. */
export function RecordingOverlay() {
  const recording = useApp((s) => s.recording);
  const countRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!recording) return;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const { t0, beatMs, numerator, recorder } = recLive;
      if (countRef.current) {
        const remaining = now < t0 ? Math.ceil((t0 - now) / beatMs - 1e-6) : 0;
        countRef.current.textContent = remaining > 0 ? String(remaining) : '';
        countRef.current.style.display = remaining > 0 ? 'grid' : 'none';
      }
      if (infoRef.current) {
        if (now < t0) infoRef.current.textContent = 'Einzählen …';
        else {
          const elapsed = now - t0;
          const measure = Math.floor(elapsed / (beatMs * numerator)) + 1;
          infoRef.current.textContent = `${formatTime(elapsed / 1000)} · Takt ${measure} · ${recorder?.noteCount ?? 0} Noten`;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording]);

  if (!recording) return null;
  return (
    <>
      <div ref={countRef} className="countin" aria-hidden="true" />
      <div className="rec-badge" role="status">
        <span className="rec-dot" /> REC <span ref={infoRef} className="rec-info" />
        <button className="btn small" onClick={stopRecording} title="Aufnahme beenden (Leertaste)">
          ■ Stopp
        </button>
      </div>
    </>
  );
}
