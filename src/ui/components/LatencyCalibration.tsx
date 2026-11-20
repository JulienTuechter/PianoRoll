import { useEffect, useRef, useState } from 'react';
import {
  analyzeTaps,
  clickTimes,
  measuredClicks,
  planEndMs,
  type CalibrationPlan,
  type CalibrationResult,
} from '../../core/latency/calibration';
import { audio, hub, transport } from '../runtime';
import { useT } from '../i18n';
import { useSettings } from '../store/settings';

const BPM = 100;
const COUNT_IN = 4;
const MEASURED = 16;
const LOOKAHEAD_MS = 120;

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; plan: CalibrationPlan }
  | { kind: 'done'; result: CalibrationResult }
  | { kind: 'failed' };

/**
 * Messtest für den Latenzausgleich: 4 Klicks Einzählen, dann 16 Klicks mitspielen.
 * Gezählt werden Anschläge am Piano (MIDI), die Leertaste und der Tipp-Knopf.
 */
export function LatencyCalibration() {
  const t = useT();
  const update = useSettings((s) => s.update);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [beat, setBeat] = useState(-1);
  const taps = useRef<number[]>([]);
  const tapRef = useRef<(timeMs: number) => void>(() => {});

  const running = phase.kind === 'running' ? phase.plan : null;

  useEffect(() => {
    if (!running) return;
    const clicks = clickTimes(running);
    let next = 0;
    tapRef.current = (timeMs: number) => {
      // Anschläge während des Einzählens zählen nicht (außer knapp vor dem ersten Messklick)
      if (timeMs >= running.startMs + (COUNT_IN - 0.5) * running.beatMs) taps.current.push(timeMs);
    };
    const offHub = hub.subscribe((e) => {
      if (e.type === 'noteon') tapRef.current(e.timeMs);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!e.repeat) tapRef.current(e.timeStamp);
    };
    window.addEventListener('keydown', onKey, true);

    // Klicks mit kurzem Vorlauf einplanen (Abbrechen stoppt so auch die noch ausstehenden)
    const pump = () => {
      const now = performance.now();
      while (next < clicks.length && clicks[next]! < now + LOOKAHEAD_MS) {
        audio.click(next % 4 === 0, Math.max(0, clicks[next]! - now) / 1000);
        next++;
      }
      setBeat(Math.floor((now - running.startMs) / running.beatMs));
      if (now >= planEndMs(running)) {
        window.clearInterval(timer);
        const result = analyzeTaps(measuredClicks(running), taps.current, running.beatMs);
        setPhase(result ? { kind: 'done', result } : { kind: 'failed' });
      }
    };
    const timer = window.setInterval(pump, 25);
    pump();
    return () => {
      offHub();
      window.removeEventListener('keydown', onKey, true);
      window.clearInterval(timer);
      tapRef.current = () => {};
    };
  }, [running]);

  const start = async () => {
    if (transport.state === 'playing') transport.pause();
    await audio.resume().catch(() => {});
    taps.current = [];
    setBeat(-1);
    setPhase({
      kind: 'running',
      plan: { startMs: performance.now() + 400, beatMs: 60000 / BPM, countIn: COUNT_IN, measured: MEASURED },
    });
  };

  const cancel = () => setPhase({ kind: 'idle' });

  if (phase.kind === 'idle')
    return (
      <div className="latency-test">
        <button className="btn small" onClick={() => void start()}>
          {t.settings.latencyTest.start}
        </button>
      </div>
    );

  if (phase.kind === 'running') {
    const counting = beat < COUNT_IN;
    return (
      <div className="latency-test running" aria-live="polite">
        <p>
          {counting
            ? t.settings.latencyTest.countIn(Math.max(1, COUNT_IN - beat))
            : t.settings.latencyTest.play}
        </p>
        <div className="latency-beats" aria-hidden="true">
          {Array.from({ length: MEASURED }, (_, i) => (
            <span key={i} className={beat - COUNT_IN >= i ? 'on' : ''} />
          ))}
        </div>
        <div className="latency-actions">
          <button className="btn small primary" onPointerDown={(e) => tapRef.current(e.timeStamp)}>
            {t.settings.latencyTest.tap}
          </button>
          <button className="btn small" onClick={cancel}>
            {t.common.cancel}
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'failed')
    return (
      <div className="latency-test" role="status">
        <p className="warn-text">{t.settings.latencyTest.failed}</p>
        <button className="btn small" onClick={() => void start()}>
          {t.settings.latencyTest.again}
        </button>
      </div>
    );

  const r = phase.result;
  return (
    <div className="latency-test" role="status">
      <p>{t.settings.latencyTest.result(r.offsetMs, r.spreadMs, r.used, r.total)}</p>
      {r.unreliable && <p className="help warn-text">{t.settings.latencyTest.unreliable}</p>}
      {r.offsetMs < 0 && <p className="help">{t.settings.latencyTest.early}</p>}
      <div className="latency-actions">
        <button
          className="btn small primary"
          onClick={() => {
            update({ latencyMs: r.suggestedMs });
            setPhase({ kind: 'idle' });
          }}
        >
          {t.settings.latencyTest.apply(r.suggestedMs)}
        </button>
        <button className="btn small" onClick={() => void start()}>
          {t.settings.latencyTest.again}
        </button>
      </div>
    </div>
  );
}
