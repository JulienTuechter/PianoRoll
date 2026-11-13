import { useEffect, useRef } from 'react';
import { worstMeasures, type TimingSummary } from '../../core/scoring/scoring';
import { formatTime } from '../format';
import { restartRun, seekToMeasure } from '../runtime';
import { useApp } from '../store/app-store';

const HANDS = { both: 'Beide Hände', left: 'Linke Hand', right: 'Rechte Hand' } as const;
const MODES = { wait: 'Warten', performance: 'Performance' } as const;

function heatColor(errors: number, max: number): string {
  if (errors === 0) return 'var(--heat-0)';
  const t = Math.min(1, errors / Math.max(1, max));
  // Hitzeskala: Ochsenblut (wenig) bis Weißglut (viel), Stufen auch über Helligkeit unterscheidbar
  return `var(--heat-${1 + Math.min(4, Math.floor(t * 4.999))})`;
}

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

function TimingSection({ t }: { t: TimingSummary }) {
  const hits = t.perfect + t.good + t.missHits;
  const judged = hits + t.missed;
  const maxBin = Math.max(1, ...t.histogram.counts);
  const mean = Math.round(t.meanOffsetMs);
  return (
    <>
      <h3>Timing</h3>
      <div className="timing-grid">
        <div>
          <Bar label="Perfect" value={t.perfect} total={judged} cls="perfect" />
          <Bar label="Good" value={t.good} total={judged} cls="good" />
          <Bar label="Miss" value={t.missHits + t.missed} total={judged} cls="miss" />
          <p className="muted small">
            Punkte: {Math.round(t.points * 100)} %, davon nicht gespielt: {t.missed}
          </p>
        </div>
        <div>
          <Bar label="zu früh ▲" value={t.early} total={hits} cls="early" />
          <Bar label="pünktlich" value={t.onTime} total={hits} cls="perfect" />
          <Bar label="zu spät ▼" value={t.late} total={hits} cls="late" />
          {hits > 0 && (
            <p className="muted small">
              Im Schnitt{' '}
              {Math.abs(mean) < 5
                ? 'genau pünktlich'
                : `${Math.abs(mean)} ms ${mean < 0 ? 'zu früh' : 'zu spät'}`}
            </p>
          )}
        </div>
      </div>
      {hits > 0 && (
        <div className="histogram" aria-label="Verteilung der Abweichungen">
          {t.histogram.counts.map((c, i) => {
            const from = t.histogram.fromMs + i * t.histogram.binMs;
            return (
              <div
                key={i}
                className={`hist-bar${Math.abs(from + t.histogram.binMs / 2) < 50 ? ' center' : ''}`}
                style={{ height: `${(c / maxBin) * 100}%` }}
                title={`${from} bis ${from + t.histogram.binMs} ms: ${c}`}
              />
            );
          })}
          <span className="hist-axis left">{t.histogram.fromMs} ms</span>
          <span className="hist-axis mid">0</span>
          <span className="hist-axis right">+{-t.histogram.fromMs} ms</span>
        </div>
      )}
    </>
  );
}

export function ResultsDialog() {
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
      <h2>{result.complete ? 'Geschafft!' : 'Durchgang beendet'}</h2>
      <dl className="meta-row">
        <div>
          <dt>Stück</dt>
          <dd>{song?.title}</dd>
        </div>
        <div>
          <dt>Modus</dt>
          <dd>{MODES[result.mode]}</dd>
        </div>
        <div>
          <dt>Hände</dt>
          <dd>{HANDS[result.hands]}</dd>
        </div>
        <div>
          <dt>Tempo</dt>
          <dd>{Math.round(result.rate * 100)} %</dd>
        </div>
        <div>
          <dt>Dauer</dt>
          <dd>{formatTime(result.durationMs / 1000)}</dd>
        </div>
      </dl>

      <div className="score-row">
        <div className={`score-big ${pct >= 90 ? 'good' : pct >= 70 ? 'mid' : 'low'}`}>{pct} %</div>
        <dl className="facts">
          <dt>Richtige Noten</dt>
          <dd>{result.correctNotes}</dd>
          <dt>Falsche Noten</dt>
          <dd>{result.wrongNotes}</dd>
          {perf && (
            <>
              <dt>Verpasst</dt>
              <dd>{result.missedNotes}</dd>
            </>
          )}
          {result.extraNotes > 0 && (
            <>
              <dt>Extra-Noten</dt>
              <dd>{result.extraNotes}</dd>
            </>
          )}
          {!perf && (
            <>
              <dt>Fehlerfreie Stellen</dt>
              <dd>
                {result.cleanGroups} / {result.completedGroups}
              </dd>
            </>
          )}
          <dt>Beste Serie</dt>
          <dd>{result.bestStreak}</dd>
        </dl>
      </div>
      {isBest && <p className="success">Neue Bestleistung!</p>}
      {!result.complete && (
        <p className="muted">
          Teil-Durchgang ({result.completedGroups} von {result.totalGroups} {perf ? 'Noten' : 'Stellen'}{' '}
          gespielt) und zählt nicht für die Bestleistung.
        </p>
      )}

      {result.timing && <TimingSection t={result.timing} />}

      {result.heatmap.length > 0 && (
        <>
          <h3>Fehler pro Takt</h3>
          <div className="heatmap" role="list">
            {result.heatmap.map((errors, i) => (
              <button
                key={i}
                role="listitem"
                className="heat-cell"
                style={{ background: heatColor(errors, maxErr) }}
                title={`Takt ${i + 1}: ${errors} Fehler. Klicken zum Hinspringen`}
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
              Problemstellen: {worst.map((w) => `Takt ${w.measure + 1} (${w.errors})`).join(', ')}. In der
              Taktleiste als Loop ziehen und gezielt üben.
            </p>
          ) : (
            <p className="muted">Keine Fehler, sauber gespielt.</p>
          )}
        </>
      )}

      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ resultsOpen: false })}>
          Schließen
        </button>
        <button
          className="btn primary"
          onClick={() => {
            set({ resultsOpen: false });
            restartRun();
          }}
        >
          Nochmal
        </button>
      </div>
    </dialog>
  );
}
