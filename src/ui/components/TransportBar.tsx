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
import { freeBeat } from '../free-metronome';
import { toggleRecording } from '../recording';
import { useApp } from '../store/app-store';
import { t as msg } from '../../i18n';
import { useT } from '../i18n';
import { useSettings, type PlayMode, type StageView } from '../store/settings';

const VIEWS: StageView[] = ['falling', 'notation', 'split'];
const MODES: PlayMode[] = ['watch', 'wait', 'performance'];

export function TransportBar() {
  const t = useT();
  const song = useApp((s) => s.song);
  const state = useApp((s) => s.transport);
  const rate = useApp((s) => s.rate);
  const audio = useApp((s) => s.audio);
  const setApp = useApp((s) => s.set);
  const mode = useSettings((s) => s.mode);
  const view = useSettings((s) => s.view);
  const sidePanelOpen = useSettings((s) => s.sidePanelOpen);
  const metronome = useSettings((s) => s.metronome);
  const loopEnabled = useApp((s) => s.loopEnabled);
  const recording = useApp((s) => s.recording);
  const update = useSettings((s) => s.update);
  const panelOpen = useSettings((s) => s.sidePanelOpen);
  const sliderRef = useRef<HTMLInputElement>(null);
  const metroRef = useRef<HTMLButtonElement>(null);
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
        timeRef.current.textContent = msg().transport.time(
          formatTime(pos),
          formatTime(transport.duration),
          measure ? String(measure) : '–',
        );
      }
      // Schlag-Impuls am Metronom-Knopf (freies Spiel)
      const mb = metroRef.current;
      if (mb) {
        const on = freeBeat.running && performance.now() - freeBeat.atMs < 110;
        mb.classList.toggle('beat', on);
        mb.classList.toggle('accent', on && freeBeat.index === 0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const playing = state === 'playing';

  return (
    <header className="transport">
      <div className="tz tz-nav">
        <div className="brand">Pianist</div>
        <button
          className="btn ghost"
          onClick={() => setApp({ libraryOpen: true })}
          title={t.transport.libraryTitle}
        >
          <Icon name="library" /> {t.transport.library}
        </button>
        <div className="song-title" title={song?.title}>
          {song ? song.title : t.transport.freePlay}
        </div>
        {song && (
          <button
            className="btn icon close-song"
            onClick={closeSong}
            title={t.transport.closeSongTitle}
            aria-label={t.transport.closeSong}
          >
            <Icon name="close" />
          </button>
        )}
      </div>

      <div className="tz tz-transport transport-controls">
        {song && (
          <button
            className="btn round"
            onClick={() => seek(0)}
            title={t.transport.toStart}
            aria-label={t.transport.toStart}
          >
            <Icon name="start" />
          </button>
        )}
        <button
          className={`btn round rec${recording ? ' active' : ''}`}
          onClick={toggleRecording}
          title={recording ? t.transport.recordStop : t.transport.recordStart}
          aria-pressed={recording !== null}
          aria-label={t.transport.record}
        >
          <Icon name={recording ? 'stop' : 'rec'} />
        </button>
        {song && (
          <button
            className="btn round play"
            onClick={togglePlay}
            title={t.transport.playTitle}
            aria-label={playing ? t.transport.pause : t.transport.play}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
        )}
        {/* Ohne Stück gibt es nichts zu spulen: Regler bleibt im DOM (Ref), wird aber ausgeblendet */}
        <input
          ref={sliderRef}
          className="position"
          type="range"
          min={0}
          step={0.01}
          defaultValue={0}
          disabled={!song}
          hidden={!song}
          aria-label={t.transport.position}
          onPointerDown={() => (dragging.current = true)}
          onPointerUp={() => (dragging.current = false)}
          onChange={(e) => seek(Number(e.target.value))}
          onKeyDown={(e) => e.preventDefault()}
        />
        <span ref={timeRef} className="time lcd" hidden={!song} />
        {song && (
          <button
            className={`btn round toggle${loopEnabled ? ' active' : ''}`}
            onClick={toggleLoop}
            title={t.transport.loopTitle}
            aria-pressed={loopEnabled}
            aria-label={t.transport.loop}
          >
            <Icon name="loop" />
          </button>
        )}
        <button
          className={`btn round toggle${metronome ? ' active' : ''}`}
          ref={metroRef}
          onClick={toggleMetronome}
          title={t.transport.metronomeTitle}
          aria-pressed={metronome}
          aria-label={t.transport.metronome}
        >
          <Icon name="metronome" />
        </button>
      </div>

      <div className="tz tz-mode">
        {song && (
          <div className="seg pill" role="group" aria-label={t.transport.viewGroup}>
            {VIEWS.map((v) => (
              <button
                key={v}
                className={view === v ? 'on' : ''}
                title={t.transport.views[v].title}
                onClick={() => update({ view: v })}
              >
                {t.transport.views[v].label}
              </button>
            ))}
          </div>
        )}

        <div className="seg pill" role="group" aria-label={t.transport.modeGroup}>
          {MODES.map((m) => (
            <button
              key={m}
              className={mode === m ? 'on' : ''}
              title={t.transport.modes[m].title}
              onClick={() => update({ mode: m })}
            >
              {t.transport.modes[m].label}
            </button>
          ))}
        </div>

        {song && (
          <label className="tempo" title={t.transport.tempoTitle}>
            <span className="tempo-label">{t.common.tempo}</span>
            <input
              type="range"
              min={25}
              max={150}
              step={5}
              value={Math.round(rate * 100)}
              onChange={(e) => setRate(Number(e.target.value) / 100)}
              onKeyDown={(e) => e.preventDefault()}
            />
            <span className="tempo-value">{t.pct(Math.round(rate * 100))}</span>
          </label>
        )}

        <button
          className={`btn icon ghost${panelOpen ? ' active' : ''}`}
          onClick={() => update({ sidePanelOpen: !panelOpen })}
          title={t.transport.panel}
          aria-label={t.transport.panel}
          aria-pressed={panelOpen}
        >
          <Icon name="panel" />
        </button>
        <button
          className="btn icon ghost"
          onClick={() => setApp({ settingsOpen: true })}
          title={t.transport.settings}
          aria-label={t.transport.settings}
        >
          <Icon name="settings" />
        </button>
      </div>

      {/* Klang-Status schwebend statt im Fluss: ein Textwechsel beim ersten Klick darf die Knöpfe nicht verschieben */}
      {audio !== 'ready' && (
        <span className={`audio-status${audio === 'loading' ? '' : ' warn'}`} role="status">
          {audio === 'locked' && t.transport.audioLocked}
          {audio === 'loading' && t.transport.audioLoading}
          {audio === 'fallback' && t.transport.audioFallback}
        </span>
      )}

      <button className="btn" onClick={() => setApp({ settingsOpen: true })}>
        Einstellungen
      </button>
      <button
        className={`btn icon side-toggle${sidePanelOpen ? ' active' : ''}`}
        onClick={() => update({ sidePanelOpen: !sidePanelOpen })}
        title={sidePanelOpen ? 'Seitenleiste einklappen (Shift+S)' : 'Seitenleiste ausklappen (Shift+S)'}
        aria-label="Seitenleiste"
        aria-pressed={sidePanelOpen}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <rect
            x="1.5"
            y="2.5"
            width="15"
            height="13"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <rect
            x="11"
            y="3"
            width="5"
            height="12"
            rx="1"
            fill="currentColor"
            opacity={sidePanelOpen ? 0.9 : 0.25}
          />
        </svg>
      </button>
    </header>
  );
}

type IconName =
  | 'library'
  | 'close'
  | 'start'
  | 'rec'
  | 'stop'
  | 'play'
  | 'pause'
  | 'loop'
  | 'metronome'
  | 'panel'
  | 'settings';

/** Kleine Strich-Icons statt Unicode-Glyphen (die je nach System-Font unterschiedlich aussehen). */
function Icon({ name }: { name: IconName }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'library':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 4v16M9 4v16M14 5l5 14.5" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'start':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M6 5v14" />
          <path d="M19 5L9 12l10 7z" fill="currentColor" />
        </svg>
      );
    case 'rec':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
        </svg>
      );
    case 'pause':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 5v14M15 5v14" strokeWidth={3} />
        </svg>
      );
    case 'loop':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M17 2l3 3-3 3" />
          <path d="M4 11V9a4 4 0 0 1 4-4h12" />
          <path d="M7 22l-3-3 3-3" />
          <path d="M20 13v2a4 4 0 0 1-4 4H4" />
        </svg>
      );
    case 'metronome':
      return (
        <svg {...common} aria-hidden="true">
          <path d="M9 3h6l4 18H5z" />
          <path d="M12 16l5-9" />
        </svg>
      );
    case 'panel':
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M15 4v16" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
  }
}
