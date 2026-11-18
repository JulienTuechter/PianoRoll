import { useEffect, useRef } from 'react';
import { worstMeasures, type TimingSummary } from '../../core/scoring/scoring';
import { formatTime, handsLabel, heatColor } from '../format';
import { restartRun, seekToMeasure } from '../runtime';
import { useT } from '../i18n';
import { useApp } from '../store/app-store';

function Bar({ label, value, total, cls }: { label: string; value: number; total: number; cls: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="dist-row">
      <span className="dist-label">{label}</span>
      <div className="dist-track">
        <div className={`dist-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="dist-value">{value}</span>
    </div>
  );
}

function TimingSection({ t: tm }: { t: TimingSummary }) {
  const t = useT();
  const hits = tm.perfect + tm.good + tm.missHits;
  const judged = hits + tm.missed;
  const maxBin = Math.max(1, ...tm.histogram.counts);
  const mean = Math.round(tm.meanOffsetMs);
  return (
    <>
      <h3>{t.results.timing}</h3>
      <div className="timing-grid">
        <div>
          <Bar label={t.hud.perfect} value={tm.perfect} total={judged} cls="perfect" />
          <Bar label={t.hud.good} value={tm.good} total={judged} cls="good" />
          <Bar label={t.hud.miss} value={tm.missHits + tm.missed} total={judged} cls="miss" />
          <p className="muted small">{t.results.points(t.pct(Math.round(tm.points * 100)), tm.missed)}</p>
        </div>
        <div>
          <Bar label={t.results.early} value={tm.early} total={hits} cls="early" />
          <Bar label={t.results.onTime} value={tm.onTime} total={hits} cls="perfect" />
          <Bar label={t.results.late} value={tm.late} total={hits} cls="late" />
          {hits > 0 && (
            <p className="muted small">
              {Math.abs(mean) < 5 ? t.results.meanExact : t.results.meanOffset(Math.abs(mean), mean < 0)}
            </p>
          )}
        </div>
      </div>
      {hits > 0 && (
        <div className="histogram" aria-label={t.results.histogram}>
          {tm.histogram.counts.map((c, i) => {
            const from = tm.histogram.fromMs + i * tm.histogram.binMs;
            return (
              <div
                key={i}
                className={`hist-bar${Math.abs(from + tm.histogram.binMs / 2) < 50 ? ' center' : ''}`}
                style={{ height: `${(c / maxBin) * 100}%` }}
                title={t.results.histBin(from, from + tm.histogram.binMs, c)}
              />
            );
          })}
          <span className="hist-axis left">{tm.histogram.fromMs} ms</span>
          <span className="hist-axis mid">0</span>
          <span className="hist-axis right">+{-tm.histogram.fromMs} ms</span>
        </div>
      )}
    </>
  );
}

export function ResultsDialog() {
  const t = useT();
  const open = useApp((s) => s.resultsOpen);
  const result = useApp((s) => s.lastResult);
  const song = useApp((s) => s.song);
  const best = useApp((s) => s.library.find((e) => e.id === s.song?.id)?.bestAccuracy ?? null);
  const set = useApp((s) => s.set);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && result && !d.open) d.showModal();
    if ((!open || !result) && d.open) d.close();
  }, [open, result]);

  if (!result) return <dialog ref={ref} className="dialog" />;
  const pct = Math.round(result.accuracy * 100);
  const maxErr = Math.max(0, ...result.heatmap);
  const worst = worstMeasures(result.heatmap);
  const isBest = result.complete && best !== null && result.correctNotes > 0 && result.accuracy >= best;
  const perf = result.mode === 'performance';

  return (
    <dialog ref={ref} className="dialog results wide" onClose={() => set({ resultsOpen: false })}>
      <h2>{result.complete ? t.results.done : t.results.ended}</h2>
      <dl className="meta-row">
        <div>
          <dt>{t.results.song}</dt>
          <dd>{song?.title}</dd>
        </div>
        <div>
          <dt>{t.results.mode}</dt>
          <dd>{t.transport.modes[result.mode].label}</dd>
        </div>
        <div>
          <dt>{t.results.hands}</dt>
          <dd>{handsLabel(t, result.hands)}</dd>
        </div>
        <div>
          <dt>{t.common.tempo}</dt>
          <dd>{t.pct(Math.round(result.rate * 100))}</dd>
        </div>
        <div>
          <dt>{t.common.duration}</dt>
          <dd>{formatTime(result.durationMs / 1000)}</dd>
        </div>
      </dl>

      <div className="score-row">
        <div className={`score-big ${pct >= 90 ? 'good' : pct >= 70 ? 'mid' : 'low'}`}>{t.pct(pct)}</div>
        <dl className="facts">
          <dt>{t.results.correct}</dt>
          <dd>{result.correctNotes}</dd>
          <dt>{t.results.wrong}</dt>
          <dd>{result.wrongNotes}</dd>
          {perf && (
            <>
              <dt>{t.results.missed}</dt>
              <dd>{result.missedNotes}</dd>
            </>
          )}
          {result.extraNotes > 0 && (
            <>
              <dt>{t.results.extra}</dt>
              <dd>{result.extraNotes}</dd>
            </>
          )}
          {!perf && (
            <>
              <dt>{t.results.cleanSpots}</dt>
              <dd>
                {result.cleanGroups} / {result.completedGroups}
              </dd>
            </>
          )}
          <dt>{t.results.bestStreak}</dt>
          <dd>{result.bestStreak}</dd>
        </dl>
      </div>
      {isBest && <p className="success">{t.results.newBest}</p>}
      {!result.complete && (
        <p className="muted">{t.results.partial(result.completedGroups, result.totalGroups, perf)}</p>
      )}

      {result.timing && <TimingSection t={result.timing} />}

      {result.heatmap.length > 0 && (
        <>
          <h3>{t.results.perMeasure}</h3>
          <div className="heatmap" role="list">
            {result.heatmap.map((errors, i) => (
              <button
                key={i}
                role="listitem"
                className="heat-cell"
                style={{ background: heatColor(errors, maxErr) }}
                title={t.results.cellTitle(i + 1, errors)}
                onClick={() => {
                  set({ resultsOpen: false });
                  seekToMeasure(i);
                }}
              >
                {errors > 0 ? errors : ''}
              </button>
            ))}
          </div>
          {worst.length > 0 ? (
            <p className="muted">
              {t.results.trouble(
                worst.map((w) => `${t.common.measure(w.measure + 1)} (${w.errors})`).join(', '),
              )}
            </p>
          ) : (
            <p className="muted">{t.results.clean}</p>
          )}
        </>
      )}

      <div className="dialog-actions">
        {song && (
          <button className="btn" onClick={() => set({ resultsOpen: false, historySongId: song.id })}>
            {t.history.open}
          </button>
        )}
        <button className="btn" onClick={() => set({ resultsOpen: false })}>
          {t.common.close}
        </button>
        <button
          className="btn primary"
          onClick={() => {
            set({ resultsOpen: false });
            restartRun();
          }}
        >
          {t.results.again}
        </button>
      </div>
    </dialog>
  );
}
