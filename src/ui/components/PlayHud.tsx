import { useEffect, useRef, useState } from 'react';
import { countInRemaining } from '../../core/practice-engine/beats';
import { midiToName } from '../../core/note-event-model/notes';
import { accuracy } from '../../core/scoring/scoring';
import { getEngine, getWaitEngine, live, transport } from '../runtime';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

interface HudSnapshot {
  mode: 'wait' | 'performance';
  accuracy: number;
  wrong: number;
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
  const t = useT();
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
    if (lastPass.tempoUp !== null) tempoInfo = t.hud.tempoUp(t.pct(Math.round(lastPass.tempoUp * 100)));
    else if (atMax) tempoInfo = t.hud.targetReached(t.pct(maxPercent));
    else tempoInfo = t.hud.toTempoUp(lastPass.cleanStreak, passes);
  }
  return (
    <div className={`loop-badge${lastPass.clean ? ' clean' : ''}`}>
      {t.hud.pass(lastPass.index, t.pct(Math.round(lastPass.accuracy * 100)))}{' '}
      {lastPass.clean ? t.hud.clean : ''}
      {tempoInfo && <span className="muted"> · {tempoInfo}</span>}
    </div>
  );
}

/** Statusanzeige über den fallenden Noten. Aktualisiert sich 10×/s, nicht pro Frame. */
export function PlayHud() {
  const t = useT();
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
          <HudItem label={t.hud.accuracy} value={t.pct(Math.round(snap.accuracy * 100))} />
          {snap.mode === 'wait' ? (
            <HudItem label={t.hud.errors} value={snap.wrong} />
          ) : (
            <>
              <HudItem label={t.hud.perfect} value={snap.perfect} />
              <HudItem label={t.hud.good} value={snap.good} />
              <HudItem label={t.hud.miss} value={snap.missed} />
              <HudItem label={t.hud.wrong} value={snap.wrong} />
            </>
          )}
          <HudItem label={t.hud.streak} value={snap.streak} />
          {snap.progress && <HudItem label={t.hud.progress} value={snap.progress} small />}
        </div>
      )}
      <LoopBadge />
      {snap?.waitingFor && (
        <div className={`waiting-pill${snap.hint ? ' hint' : ''}`}>
          {snap.hint ? t.hud.hintPlay : t.hud.waitingFor}
          <strong>{snap.waitingFor}</strong>
        </div>
      )}
    </>
  );
}
