import { useEffect, useRef, useState } from 'react';
import { countInRemaining } from '../../core/practice-engine/beats';
import { midiToName } from '../../core/note-event-model/notes';
import { accuracy } from '../../core/scoring/scoring';
import { getEngine, getWaitEngine, live, transport } from '../runtime';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

interface HudSnapshot {
  mode: 'wait' | 'performance';
  accuracy: number;
  wrong: number;
  extra: number;
  missed: number;
  perfect: number;
  good: number;
  streak: number;
  progress: string | null;
  waitingFor: string | null;
  hint: boolean;
}

function snapshot(): HudSnapshot | null {
  const e = getEngine();
  if (!e) return null;
  const s = e.stats;
  const wait = getWaitEngine();
  const group = wait?.currentGroup ?? null;
  const waiting = transport.waiting && group !== null;
  return {
    mode: e.mode,
    accuracy: accuracy(s),
    wrong: s.wrongNotes,
    extra: s.extraNotes,
    missed: s.missedNotes,
    perfect: s.timing.perfect,
    good: s.timing.good,
    streak: s.streak,
    progress: wait ? `${Math.min(wait.currentGroupIndex, wait.groups.length)} / ${wait.groups.length}` : null,
    waitingFor:
      waiting && wait
        ? [...group.expected.keys()]
            .filter((m) => !wait.satisfied.has(m))
            .sort((a, b) => a - b)
            .map(midiToName)
            .join(' ')
        : null,
    hint: wait?.hint ?? false,
  };
}

function HudItem({ label, value, small }: { label: string; value: string | number; small?: boolean }) {
  return (
    <div className="hud-item">
      <span className="hud-label">{label}</span>
      <span className={`hud-value${small ? ' small' : ''}`}>{value}</span>
    </div>
  );
}

/** Große Einzähl-Anzeige; per rAF direkt ins DOM, damit die Ziffern exakt zum Klick wechseln. */
function CountInOverlay() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      const ci = live.countIn;
      if (el) {
        const n = ci && transport.state === 'playing' ? countInRemaining(ci, transport.position) : 0;
        el.textContent = n > 0 ? String(n) : '';
        el.style.display = n > 0 ? 'grid' : 'none';
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} className="countin" aria-hidden="true" />;
}

function LoopBadge() {
  const lastPass = useApp((s) => s.lastPass);
  const loopEnabled = useApp((s) => s.loopEnabled);
  const rate = useApp((s) => s.rate);
  const autoTempo = useSettings((s) => s.autoTempo);
  const passes = useSettings((s) => s.autoTempoPasses);
  const maxPercent = useSettings((s) => s.autoTempoMaxPercent);
  if (!loopEnabled || !lastPass) return null;
  const atMax = Math.round(rate * 100) >= maxPercent;
  let tempoInfo: string | null = null;
  if (autoTempo) {
    if (lastPass.tempoUp !== null) tempoInfo = `Tempo ↑ ${Math.round(lastPass.tempoUp * 100)} %`;
    else if (atMax) tempoInfo = `Zieltempo ${maxPercent} % erreicht`;
    else tempoInfo = `${lastPass.cleanStreak}/${passes} bis Tempo ↑`;
  }
  return (
    <div className={`loop-badge${lastPass.clean ? ' clean' : ''}`}>
      Durchlauf {lastPass.index}: {Math.round(lastPass.accuracy * 100)} % {lastPass.clean ? '✓ sauber' : ''}
      {tempoInfo && <span className="muted"> · {tempoInfo}</span>}
    </div>
  );
}

/** Statusanzeige über den fallenden Noten. Aktualisiert sich 10×/s, nicht pro Frame. */
export function PlayHud() {
  const strict = useSettings((s) => s.strict);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);

  useEffect(() => {
    let last = '';
    const id = setInterval(() => {
      const next = snapshot();
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setSnap(next);
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <CountInOverlay />
      {snap && (
        <div className="hud" aria-live="off">
          <HudItem label="Genauigkeit" value={`${Math.round(snap.accuracy * 100)} %`} />
          {snap.mode === 'wait' ? (
            <HudItem label={strict ? 'Fehler' : 'Extra-Noten'} value={strict ? snap.wrong : snap.extra} />
          ) : (
            <>
              <HudItem label="Perfect" value={snap.perfect} />
              <HudItem label="Good" value={snap.good} />
              <HudItem label="Miss" value={snap.missed} />
              <HudItem label="Falsch" value={snap.wrong} />
            </>
          )}
          <HudItem label="Serie" value={snap.streak} />
          {snap.progress && <HudItem label="Fortschritt" value={snap.progress} small />}
        </div>
      )}
      <LoopBadge />
      {snap?.waitingFor && (
        <div className={`waiting-pill${snap.hint ? ' hint' : ''}`}>
          {snap.hint ? 'Tipp: spiele ' : 'Warte auf '}
          <strong>{snap.waitingFor}</strong>
        </div>
      )}
    </>
  );
}
