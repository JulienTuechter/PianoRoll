/**
 * Lernverlauf: wertet die gespeicherten Durchgänge eines Stücks über Tage und Takte aus.
 */
import type { RunMode, RunResult } from '../scoring/scoring';

/** Nur vollständige Durchgänge mit gespielten Noten zählen als Bestleistung (wie in recordRun). */
export function countsForBest(r: RunResult): boolean {
  return r.complete && r.correctNotes > 0;
}

/** Lokales Datum als „JJJJ-MM-TT“ (Übungstage richten sich nach der Uhr des Nutzers). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface DayProgress {
  day: string;
  /** Zeitpunkt des letzten Durchgangs an diesem Tag */
  lastAt: number;
  runs: number;
  /** Beste Genauigkeit eines vollständigen Durchgangs, sonst null */
  best: number | null;
  /** Durchschnittliche Genauigkeit aller Durchgänge des Tages */
  mean: number;
  practiceMs: number;
}

/** Durchgänge nach Übungstag gruppiert, älteste zuerst. */
export function progressByDay(runs: readonly RunResult[]): DayProgress[] {
  const byDay = new Map<string, RunResult[]>();
  for (const r of [...runs].sort((a, b) => a.finishedAt - b.finishedAt)) {
    const k = dayKey(r.finishedAt);
    const list = byDay.get(k);
    if (list) list.push(r);
    else byDay.set(k, [r]);
  }
  return [...byDay].map(([day, list]) => {
    const full = list.filter(countsForBest);
    return {
      day,
      lastAt: Math.max(...list.map((r) => r.finishedAt)),
      runs: list.length,
      best: full.length ? Math.max(...full.map((r) => r.accuracy)) : null,
      mean: list.reduce((s, r) => s + r.accuracy, 0) / list.length,
      practiceMs: list.reduce((s, r) => s + r.durationMs, 0),
    };
  });
}

export interface ProgressSummary {
  runs: number;
  days: number;
  practiceMs: number;
  best: number | null;
  /** Mittlere Genauigkeit der letzten bzw. der davorliegenden `window` Durchgänge */
  recentMean: number | null;
  earlierMean: number | null;
}

export function summarizeProgress(runs: readonly RunResult[], window = 5): ProgressSummary {
  const sorted = [...runs].sort((a, b) => a.finishedAt - b.finishedAt);
  const mean = (list: RunResult[]) =>
    list.length ? list.reduce((s, r) => s + r.accuracy, 0) / list.length : null;
  const full = sorted.filter(countsForBest);
  return {
    runs: sorted.length,
    days: new Set(sorted.map((r) => dayKey(r.finishedAt))).size,
    practiceMs: sorted.reduce((s, r) => s + r.durationMs, 0),
    best: full.length ? Math.max(...full.map((r) => r.accuracy)) : null,
    recentMean: mean(sorted.slice(-window)),
    earlierMean: sorted.length > window ? mean(sorted.slice(-2 * window, -window)) : null,
  };
}

export interface MeasureTrend {
  /** Ø Fehler je Durchgang und Takt in den letzten `window` Durchgängen */
  recent: number[];
  /** dasselbe für die `window` Durchgänge davor; null, wenn es noch keine gibt */
  earlier: number[] | null;
  recentRuns: number;
  earlierRuns: number;
}

/**
 * Takt-Verlauf: vergleicht die Fehler je Takt der letzten Durchgänge mit den davorliegenden.
 * Taktanzahl = die des jüngsten Durchgangs (ältere Ergebnisse mit abweichender Länge werden angepasst).
 */
export function measureTrend(runs: readonly RunResult[], window = 5): MeasureTrend | null {
  const sorted = [...runs].filter((r) => r.heatmap.length > 0).sort((a, b) => a.finishedAt - b.finishedAt);
  const last = sorted.at(-1);
  if (!last) return null;
  const n = last.heatmap.length;
  const avg = (list: RunResult[]) => {
    const sum = new Array<number>(n).fill(0);
    for (const r of list) for (let i = 0; i < n; i++) sum[i]! += r.heatmap[i] ?? 0;
    return sum.map((v) => v / list.length);
  };
  const recent = sorted.slice(-window);
  const earlier = sorted.slice(-2 * window, -window);
  return {
    recent: avg(recent),
    earlier: earlier.length ? avg(earlier) : null,
    recentRuns: recent.length,
    earlierRuns: earlier.length,
  };
}

export function filterByMode(runs: readonly RunResult[], mode: RunMode | 'all'): RunResult[] {
  return mode === 'all' ? [...runs] : runs.filter((r) => r.mode === mode);
}
