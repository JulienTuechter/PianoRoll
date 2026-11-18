import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  dayKey,
  filterByMode,
  measureTrend,
  progressByDay,
  summarizeProgress,
  type DayProgress,
} from '../../core/library/progress';
import type { RunMode, RunResult } from '../../core/scoring/scoring';
import type { Messages } from '../../i18n';
import { formatDuration, handsLabel, heatColor, heatLevel } from '../format';
import { useT } from '../i18n';
import { libraryRepo } from '../library-repo';
import { errorMessage, openFromLibrary, seekToMeasure } from '../runtime';
import { useApp } from '../store/app-store';

const TREND_WINDOW = 5;
const PAGE = 10;
type ModeFilter = RunMode | 'all';

const pctText = (t: Messages, v: number | null) => (v === null ? '–' : t.pct(Math.round(v * 100)));

function dateText(t: Messages, ts: number, withTime: boolean): string {
  const d = new Date(ts);
  const date = d.toLocaleDateString(t.dateLocale, { day: '2-digit', month: '2-digit', year: '2-digit' });
  return withTime
    ? `${date} ${d.toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' })}`
    : date;
}

/** Breite des Containers (für ein scharfes SVG ohne verzerrte Schrift). */
function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // ResizeObserver meldet die Anfangsgröße beim Beobachten selbst
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Beste Genauigkeit je Übungstag als Linie, einzelne Durchgänge als zurückhaltende Punkte dahinter. */
function AccuracyChart({ days, runs }: { days: DayProgress[]; runs: RunResult[] }) {
  const t = useT();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 200;
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const plotW = Math.max(40, width - pad.l - pad.r);
  const plotH = H - pad.t - pad.b;

  const minAcc = Math.min(...runs.map((r) => r.accuracy));
  // Untergrenze in Zehnerschritten unterhalb des schwächsten Durchgangs, damit Fortschritt sichtbar bleibt
  const yMin = Math.max(0, Math.min(0.5, Math.floor((minAcc - 0.05) * 10) / 10));
  const y = (v: number) => pad.t + (1 - (v - yMin) / (1 - yMin)) * plotH;
  const step = days.length > 1 ? plotW / (days.length - 1) : 0;
  const x = (i: number) => pad.l + (days.length > 1 ? i * step : plotW / 2);
  const dayIndex = new Map(days.map((d, i) => [d.day, i]));
  const ticks = [yMin, (yMin + 1) / 2, 1];

  // Linie mit Lücken an Tagen ohne vollständigen Durchgang
  const segments: string[] = [];
  let cur = '';
  days.forEach((d, i) => {
    if (d.best === null) {
      if (cur) segments.push(cur);
      cur = '';
      return;
    }
    cur += `${cur ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.best).toFixed(1)}`;
  });
  if (cur) segments.push(cur);

  const labelEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 80))));
  const hovered = hover !== null ? days[hover] : undefined;

  return (
    <figure className="hist-chart">
      <figcaption className="chart-head">
        <span>{t.history.chartTitle}</span>
        <span className="chart-legend">
          <span className="lg-line" aria-hidden="true" />
          {t.history.legendBest}
          <span className="lg-dot" aria-hidden="true" />
          {t.history.legendRun}
        </span>
      </figcaption>
      <div className="chart-wrap" ref={wrapRef}>
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={t.history.chartLabel(days.length)}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line className="chart-grid" x1={pad.l} x2={pad.l + plotW} y1={y(v)} y2={y(v)} />
              <text className="chart-axis" x={pad.l - 8} y={y(v) + 4} textAnchor="end">
                {t.pct(Math.round(v * 100))}
              </text>
            </g>
          ))}
          {days.map((d, i) =>
            i % labelEvery === 0 || i === days.length - 1 ? (
              <text key={d.day} className="chart-axis" x={x(i)} y={H - 8} textAnchor="middle">
                {new Date(d.lastAt).toLocaleDateString(t.dateLocale, { day: '2-digit', month: '2-digit' })}
              </text>
            ) : null,
          )}
          {hovered && (
            <line className="chart-cross" x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={pad.t + plotH} />
          )}
          {runs.map((r, i) => {
            const di = dayIndex.get(dayKey(r.finishedAt));
            return di === undefined ? null : (
              <circle key={i} className="chart-run" cx={x(di)} cy={y(r.accuracy)} r={3.5} />
            );
          })}
          {segments.map((d, i) => (
            <path key={i} className="chart-line" d={d} />
          ))}
          {days.map((d, i) =>
            d.best === null ? null : (
              <circle
                key={d.day}
                className={`chart-point${hover === i ? ' on' : ''}`}
                cx={x(i)}
                cy={y(d.best)}
                r={hover === i ? 5.5 : 4.5}
              />
            ),
          )}
          {/* Trefferflächen je Tag, breiter als die Markierung */}
          {days.map((d, i) => (
            <rect
              key={d.day}
              className="chart-hit"
              x={x(i) - Math.max(10, step / 2)}
              y={pad.t}
              width={Math.max(20, step)}
              height={plotH}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hovered && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(Math.max(x(hover!), 90), width - 90),
              top: hovered.best !== null ? y(hovered.best) - 12 : pad.t,
            }}
          >
            {t.history.dayTip(
              dateText(t, hovered.lastAt, false),
              hovered.runs,
              pctText(t, hovered.best),
              pctText(t, hovered.mean),
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

function MeasureCompare({ runs, songId }: { runs: RunResult[]; songId: string }) {
  const t = useT();
  const set = useApp((s) => s.set);
  const currentId = useApp((s) => s.song?.id ?? null);
  const trend = useMemo(() => measureTrend(runs, TREND_WINDOW), [runs]);
  if (!trend || trend.recent.length === 0) return null;
  const max = Math.max(...trend.recent, ...(trend.earlier ?? []));
  const fmt = (v: number) => (v === 0 ? '' : Number.isInteger(v) ? String(v) : t.num(v, 1));
  const jump = (i: number) => {
    set({ historySongId: null });
    if (currentId === songId) seekToMeasure(i);
    else
      void openFromLibrary(songId)
        .then(() => seekToMeasure(i))
        .catch((err: unknown) => set({ error: errorMessage(err) }));
  };

  const changes = trend.earlier
    ? trend.recent.map((r, i) => ({ m: i, d: r - (trend.earlier![i] ?? 0) }))
    : [];
  const list = (xs: { m: number }[]) => xs.map((c) => t.common.measure(c.m + 1)).join(', ');
  const improved = changes
    .filter((c) => c.d <= -1)
    .sort((a, b) => a.d - b.d)
    .slice(0, 4);
  const worse = changes
    .filter((c) => c.d >= 1)
    .sort((a, b) => b.d - a.d)
    .slice(0, 4);

  const row = (values: number[], label: string, other: number[] | null) => (
    <div className="trend-row">
      <span className="trend-label">{label}</span>
      <div className="heatmap" role="list" aria-label={label}>
        {values.map((v, i) => (
          <button
            key={i}
            role="listitem"
            className="heat-cell"
            style={{
              background: heatColor(v, max),
              // Auf den dunklen Stufen helle Schrift, sonst ist die Zahl kaum lesbar
              color: heatLevel(v, max) <= 2 ? 'var(--color-ink)' : undefined,
            }}
            title={t.history.measureTip(i + 1, t.num(v, 1), other ? t.num(other[i] ?? 0, 1) : null)}
            onClick={() => jump(i)}
          >
            {fmt(Math.round(v * 10) / 10)}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <h3>{t.history.measures}</h3>
      <p className="muted small">{t.history.measuresHelp}</p>
      {row(trend.recent, t.history.recentRow(trend.recentRuns), trend.earlier)}
      {trend.earlier && row(trend.earlier, t.history.earlierRow(trend.earlierRuns), trend.recent)}
      {improved.length > 0 && <p className="success small">{t.history.improved(list(improved))}</p>}
      {worse.length > 0 && <p className="muted small">{t.history.worse(list(worse))}</p>}
    </>
  );
}

function RunTable({ runs }: { runs: RunResult[] }) {
  const t = useT();
  const [shown, setShown] = useState(PAGE);
  const newest = useMemo(() => [...runs].sort((a, b) => b.finishedAt - a.finishedAt), [runs]);
  return (
    <>
      <h3>{t.history.list}</h3>
      <div className="table-wrap">
        <table className="lib-table runs-table">
          <thead>
            <tr>
              <th>{t.history.colDate}</th>
              <th>{t.history.colMode}</th>
              <th>{t.history.colHands}</th>
              <th className="num">{t.history.colTempo}</th>
              <th className="num">{t.history.colAccuracy}</th>
            </tr>
          </thead>
          <tbody>
            {newest.slice(0, shown).map((r, i) => (
              <tr key={`${r.finishedAt}-${i}`}>
                <td>{dateText(t, r.finishedAt, true)}</td>
                <td>{t.transport.modes[r.mode].label}</td>
                <td>{handsLabel(t, r.hands)}</td>
                <td className="num">{t.pct(Math.round(r.rate * 100))}</td>
                <td className="num">
                  {!r.complete && <span className="tag">{t.history.partialTag}</span>}{' '}
                  {t.pct(Math.round(r.accuracy * 100))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {newest.length > shown && (
        <button className="btn small more" onClick={() => setShown((n) => n + PAGE * 2)}>
          {t.history.showMore(Math.min(PAGE * 2, newest.length - shown))}
        </button>
      )}
    </>
  );
}

/** Inhalt für ein Stück; wird je Stück neu gemountet (key), damit Filter und Daten zurückgesetzt werden. */
function HistoryBody({ songId }: { songId: string }) {
  const t = useT();
  const runCount = useApp((s) => s.library.find((e) => e.id === songId)?.runCount ?? 0);
  const [all, setAll] = useState<RunResult[] | null>(null);
  // Warte- und Performance-Genauigkeit sind nicht direkt vergleichbar, daher umschaltbar
  const [mode, setMode] = useState<ModeFilter>('all');

  // Neu laden, wenn ein Durchgang dazukommt
  useEffect(() => {
    let alive = true;
    libraryRepo
      .runs(songId)
      .then((rs) => alive && setAll(rs.map((r) => r.result)))
      .catch(() => alive && setAll([]));
    return () => {
      alive = false;
    };
  }, [songId, runCount]);

  const runs = useMemo(() => filterByMode(all ?? [], mode), [all, mode]);
  const days = useMemo(() => progressByDay(runs), [runs]);
  const sum = useMemo(() => summarizeProgress(runs, TREND_WINDOW), [runs]);
  const hasBothModes =
    all !== null && all.some((r) => r.mode === 'wait') && all.some((r) => r.mode === 'performance');

  if (all === null) return null;
  if (all.length === 0) return <p className="muted">{t.history.empty}</p>;
  return (
    <>
      {hasBothModes && (
        <div className="seg pill" role="group" aria-label={t.history.filter}>
          {(['all', 'wait', 'performance'] as const).map((m) => (
            <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              {m === 'all' ? t.history.all : t.transport.modes[m].label}
            </button>
          ))}
        </div>
      )}
      {runs.length === 0 ? (
        <p className="muted">{t.history.emptyFiltered}</p>
      ) : (
        <>
          <dl className="meta-row">
            <div>
              <dt>{t.history.runs}</dt>
              <dd>{sum.runs}</dd>
            </div>
            <div>
              <dt>{t.history.days}</dt>
              <dd>{sum.days}</dd>
            </div>
            <div>
              <dt>{t.history.time}</dt>
              <dd>{formatDuration(sum.practiceMs)}</dd>
            </div>
            <div>
              <dt>{t.history.best}</dt>
              <dd>{pctText(t, sum.best)}</dd>
            </div>
            {sum.earlierMean !== null && sum.recentMean !== null && (
              <div title={t.history.trendHelp(TREND_WINDOW)}>
                <dt>{t.history.trend}</dt>
                <dd>{t.history.trendValue(pctText(t, sum.recentMean), pctText(t, sum.earlierMean))}</dd>
              </div>
            )}
          </dl>
          <AccuracyChart days={days} runs={runs} />
          <MeasureCompare runs={runs} songId={songId} />
          <RunTable runs={runs} />
        </>
      )}
    </>
  );
}

export function HistoryDialog() {
  const t = useT();
  const songId = useApp((s) => s.historySongId);
  const title = useApp((s) => s.library.find((e) => e.id === s.historySongId)?.title);
  const set = useApp((s) => s.set);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (songId && !d.open) d.showModal();
    if (!songId && d.open) d.close();
  }, [songId]);

  return (
    <dialog ref={ref} className="dialog wide history" onClose={() => set({ historySongId: null })}>
      <h2>{t.history.heading}</h2>
      {songId && (
        <>
          <p className="history-title">{title}</p>
          <HistoryBody key={songId} songId={songId} />
        </>
      )}
      <div className="dialog-actions">
        <button className="btn" onClick={() => set({ historySongId: null })}>
          {t.common.close}
        </button>
      </div>
    </dialog>
  );
}
