import { useEffect, useRef } from 'react';
import { formatTime } from '../format';
import {
  closeSong,
  live,
  seek,
  setRate,
  toggleLoop,
  toggleMetronome,
  togglePlay,
  transport,
} from '../runtime';
import { toggleRecording } from '../recording';
import { useApp } from '../store/app-store';
import { useSettings, type PlayMode, type StageView } from '../store/settings';

const VIEWS: { id: StageView; label: string; title: string }[] = [
  { id: 'falling', label: 'Fallend', title: 'Nur fallende Noten' },
  { id: 'notation', label: 'Noten', title: 'Nur Notenschrift' },
  { id: 'split', label: 'Beides', title: 'Notenschrift oben, fallende Noten unten' },
];

const MODES: { id: PlayMode; label: string; title: string }[] = [
  { id: 'watch', label: 'Anschauen', title: 'Stück läuft durch und wird vorgespielt' },
  { id: 'wait', label: 'Warten', title: 'Stück wartet, bis du die richtigen Noten spielst' },
  { id: 'performance', label: 'Performance', title: 'Echtzeit ohne Warten, mit Timing-Wertung' },
];

export function TransportBar() {
  const song = useApp((s) => s.song);
  const state = useApp((s) => s.transport);
  const rate = useApp((s) => s.rate);
  const audio = useApp((s) => s.audio);
  const setApp = useApp((s) => s.set);
  const mode = useSettings((s) => s.mode);
  const view = useSettings((s) => s.view);
  const metronome = useSettings((s) => s.metronome);
  const loopEnabled = useApp((s) => s.loopEnabled);
  const recording = useApp((s) => s.recording);
  const update = useSettings((s) => s.update);
  const sliderRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  // Position direkt ins DOM schreiben, ohne React-Rerender pro Frame
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pos = transport.position;
      if (sliderRef.current && !dragging.current) {
        sliderRef.current.max = String(Math.max(1, transport.duration));
        sliderRef.current.value = String(pos);
      }
      if (timeRef.current) {
        let measure = 0;
        for (const m of live.measures) if (m.startSec <= pos + 1e-6) measure = m.index + 1;
        timeRef.current.textContent = `${formatTime(pos)} / ${formatTime(transport.duration)} · Takt ${measure || '–'}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const playing = state === 'playing';

  return (
    <header className="transport">
      <div className="brand">Pianist</div>

      <button className="btn" onClick={() => setApp({ libraryOpen: true })} title="Bibliothek (Shift+B)">
        Bibliothek
      </button>

      <div className="song-title" title={song?.title}>
        {song ? song.title : 'Freies Spiel'}
      </div>
      {song && (
        <button
          className="btn icon close-song"
          onClick={closeSong}
          title="Stück schließen – zurück zum freien Spiel"
          aria-label="Stück schließen"
        >
          ✕
        </button>
      )}

      {song && (
        <div className="seg mode" role="group" aria-label="Ansicht">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={view === v.id ? 'on' : ''}
              title={v.title}
              onClick={() => update({ view: v.id })}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="seg mode" role="group" aria-label="Modus">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={mode === m.id ? 'on' : ''}
            title={m.title}
            onClick={() => update({ mode: m.id })}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="transport-controls">
        <button className="btn icon" onClick={() => seek(0)} disabled={!song} title="Zum Anfang">
          ⏮
        </button>
        <button
          className={`btn icon rec${recording ? ' active' : ''}`}
          onClick={toggleRecording}
          title={recording ? 'Aufnahme beenden (Leertaste)' : 'Aufnahme starten (mit Count-in und Metronom)'}
          aria-pressed={recording !== null}
          aria-label="Aufnahme"
        >
          {recording ? '■' : '●'}
        </button>
        <button
          className="btn icon primary"
          onClick={togglePlay}
          disabled={!song}
          title="Play/Pause (Leertaste)"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <input
          ref={sliderRef}
          className="position"
          type="range"
          min={0}
          step={0.01}
          defaultValue={0}
          disabled={!song}
          aria-label="Position"
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onChange={(e) => seek(Number(e.target.value))}
          onKeyDown={(e) => e.preventDefault()}
        />
        <span ref={timeRef} className="time" />
      </div>

      <button
        className={`btn icon toggle${loopEnabled ? ' active' : ''}`}
        onClick={toggleLoop}
        disabled={!song}
        title="Loop an/aus (L) – Bereich in der Taktleiste ziehen"
        aria-pressed={loopEnabled}
        aria-label="Loop"
      >
        ⟲
      </button>
      <button
        className={`btn icon toggle${metronome ? ' active' : ''}`}
        onClick={toggleMetronome}
        title="Metronom an/aus (Shift+M)"
        aria-pressed={metronome}
        aria-label="Metronom"
      >
        ♩
      </button>

      <label className="tempo" title="Tempo (Tonhöhe bleibt gleich)">
        Tempo
        <input
          type="range"
          min={25}
          max={150}
          step={5}
          value={Math.round(rate * 100)}
          onChange={(e) => setRate(Number(e.target.value) / 100)}
          onKeyDown={(e) => e.preventDefault()}
        />
        <span className="tempo-value">{Math.round(rate * 100)} %</span>
      </label>

      {audio === 'locked' && <span className="badge warn">Klick zum Aktivieren des Klangs</span>}
      {audio === 'loading' && <span className="badge">Lade Klavierklang …</span>}
      {audio === 'fallback' && (
        <span className="badge warn" title="Samples nicht geladen">
          Synth-Klang
        </span>
      )}

      <button className="btn" onClick={() => setApp({ settingsOpen: true })}>
        Einstellungen
      </button>
    </header>
  );
}
