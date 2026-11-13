/** Laufende Statistik eines Durchgangs (Wait- und Performance-Modus). */
export interface RunStats {
  /** Korrekt getroffene erwartete Noten (im Performance-Modus: Perfect + Good) */
  correctNotes: number;
  /** Falsche Noten, die als Fehler zählen */
  wrongNotes: number;
  /** Zusätzliche Noten, die toleriert wurden (lockerer Wait-Modus) */
  extraNotes: number;
  /** Erwartete Noten, die nicht (rechtzeitig) gespielt wurden – Performance-Modus */
  missedNotes: number;
  completedGroups: number;
  /** Gruppen, die ohne Fehler abgeschlossen wurden */
  cleanGroups: number;
  streak: number;
  bestStreak: number;
  /** Fehler pro Taktindex */
  errorsByMeasure: Map<number, number>;
  timing: TimingStats;
}

export interface TimingStats {
  perfect: number;
  good: number;
  /** Richtige Taste, aber außerhalb des Good-Fensters */
  missHits: number;
  early: number;
  onTime: number;
  late: number;
  /** Abweichungen in ms (negativ = zu früh) aller getroffenen Noten */
  offsetsMs: number[];
}

export function emptyStats(): RunStats {
  return {
    correctNotes: 0,
    wrongNotes: 0,
    extraNotes: 0,
    missedNotes: 0,
    completedGroups: 0,
    cleanGroups: 0,
    streak: 0,
    bestStreak: 0,
    errorsByMeasure: new Map(),
    timing: { perfect: 0, good: 0, missHits: 0, early: 0, onTime: 0, late: 0, offsetsMs: [] },
  };
}

/** Genauigkeit 0..1 = richtige / (richtige + Fehler + verpasste). Ohne gespielte Noten → 1. */
export function accuracy(
  stats: Pick<RunStats, 'correctNotes' | 'wrongNotes'> & { missedNotes?: number },
): number {
  const total = stats.correctNotes + stats.wrongNotes + (stats.missedNotes ?? 0);
  return total === 0 ? 1 : stats.correctNotes / total;
}

function bumpMeasure(stats: RunStats, measure: number): void {
  stats.errorsByMeasure.set(measure, (stats.errorsByMeasure.get(measure) ?? 0) + 1);
}

export function recordCorrect(stats: RunStats, count = 1): void {
  stats.correctNotes += count;
}

export function recordError(stats: RunStats, measure: number): void {
  stats.wrongNotes++;
  stats.streak = 0;
  bumpMeasure(stats, measure);
}

export function recordMissed(stats: RunStats, measure: number): void {
  stats.missedNotes++;
  stats.streak = 0;
  bumpMeasure(stats, measure);
}

export function recordGroupComplete(stats: RunStats, hadErrors: boolean): void {
  stats.completedGroups++;
  if (!hadErrors) stats.cleanGroups++;
  stats.streak++;
  stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
}

// ---------- Timing (Performance-Modus) ----------

export interface TimingWindows {
  perfectMs: number;
  goodMs: number;
  /** Bis zu dieser Abweichung wird eine Taste noch einer erwarteten Note zugeordnet (sonst: falsche Note) */
  catchMs: number;
}

export const defaultTimingWindows: TimingWindows = { perfectMs: 50, goodMs: 120, catchMs: 250 };

export type TimingGrade = 'perfect' | 'good' | 'miss';
export type TimingDirection = 'early' | 'onTime' | 'late';

export function gradeOffset(
  offsetMs: number,
  w: TimingWindows,
): { grade: TimingGrade; direction: TimingDirection } {
  const abs = Math.abs(offsetMs);
  if (abs <= w.perfectMs) return { grade: 'perfect', direction: 'onTime' };
  const direction: TimingDirection = offsetMs < 0 ? 'early' : 'late';
  return { grade: abs <= w.goodMs ? 'good' : 'miss', direction };
}

/** Wertet einen Treffer der richtigen Taste und aktualisiert die Statistik. */
export function recordHit(stats: RunStats, offsetMs: number, w: TimingWindows, measure: number): TimingGrade {
  const { grade, direction } = gradeOffset(offsetMs, w);
  const t = stats.timing;
  t.offsetsMs.push(offsetMs);
  t[direction]++;
  if (grade === 'miss') {
    t.missHits++;
    recordMissed(stats, measure);
  } else {
    t[grade]++;
    stats.correctNotes++;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  }
  return grade;
}

export interface TimingSummary {
  perfect: number;
  good: number;
  missHits: number;
  missed: number;
  early: number;
  onTime: number;
  late: number;
  meanOffsetMs: number;
  /** Punkte 0..1: Perfect 100 %, Good 60 % */
  points: number;
  histogram: { fromMs: number; binMs: number; counts: number[] };
}

export function buildHistogram(
  offsets: readonly number[],
  rangeMs: number,
  binMs: number,
): TimingSummary['histogram'] {
  const bins = Math.ceil((2 * rangeMs) / binMs);
  const counts = new Array<number>(bins).fill(0);
  for (const o of offsets) {
    const i = Math.floor((Math.max(-rangeMs, Math.min(rangeMs - 1e-9, o)) + rangeMs) / binMs);
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return { fromMs: -rangeMs, binMs, counts };
}

export function summarizeTiming(stats: RunStats, totalExpected: number, w: TimingWindows): TimingSummary {
  const t = stats.timing;
  const mean = t.offsetsMs.length ? t.offsetsMs.reduce((a, b) => a + b, 0) / t.offsetsMs.length : 0;
  return {
    perfect: t.perfect,
    good: t.good,
    missHits: t.missHits,
    missed: stats.missedNotes - t.missHits,
    early: t.early,
    onTime: t.onTime,
    late: t.late,
    meanOffsetMs: mean,
    points: totalExpected > 0 ? (t.perfect + 0.6 * t.good) / totalExpected : 1,
    histogram: buildHistogram(t.offsetsMs, w.catchMs, Math.max(10, Math.round(w.catchMs / 12))),
  };
}

// ---------- Ergebnis ----------

export type RunMode = 'wait' | 'performance';

export interface RunResult {
  mode: RunMode;
  hands: 'both' | 'left' | 'right';
  /** Tempo-Faktor beim Durchgang */
  rate: number;
  finishedAt: number;
  durationMs: number;
  accuracy: number;
  correctNotes: number;
  wrongNotes: number;
  extraNotes: number;
  missedNotes: number;
  /** Wait: Gruppen; Performance: erwartete Noten */
  totalGroups: number;
  completedGroups: number;
  /** Nichts per Sprung ausgelassen – nur dann zählt der Durchgang für die Bestleistung */
  complete: boolean;
  cleanGroups: number;
  bestStreak: number;
  /** Fehler je Takt, Index = Taktindex, Länge = Anzahl Takte */
  heatmap: number[];
  timing: TimingSummary | null;
}

export function buildResult(
  stats: RunStats,
  info: {
    mode?: RunMode;
    hands: RunResult['hands'];
    rate?: number;
    totalGroups: number;
    completedGroups?: number;
    complete?: boolean;
    measureCount: number;
    durationMs: number;
    finishedAt: number;
    timing?: TimingSummary | null;
  },
): RunResult {
  const heatmap = new Array<number>(Math.max(0, info.measureCount)).fill(0);
  for (const [m, count] of stats.errorsByMeasure) if (m >= 0 && m < heatmap.length) heatmap[m] = count;
  const completed = info.completedGroups ?? stats.completedGroups;
  return {
    mode: info.mode ?? 'wait',
    hands: info.hands,
    rate: info.rate ?? 1,
    finishedAt: info.finishedAt,
    durationMs: info.durationMs,
    accuracy: accuracy(stats),
    correctNotes: stats.correctNotes,
    wrongNotes: stats.wrongNotes,
    extraNotes: stats.extraNotes,
    missedNotes: stats.missedNotes,
    totalGroups: info.totalGroups,
    completedGroups: completed,
    complete: info.complete ?? completed >= info.totalGroups,
    cleanGroups: stats.cleanGroups,
    bestStreak: stats.bestStreak,
    heatmap,
    timing: info.timing ?? null,
  };
}

/** Die n Takte mit den meisten Fehlern (für „Problemstellen“). */
export function worstMeasures(heatmap: readonly number[], n = 3): { measure: number; errors: number }[] {
  return heatmap
    .map((errors, measure) => ({ measure, errors }))
    .filter((x) => x.errors > 0)
    .sort((a, b) => b.errors - a.errors || a.measure - b.measure)
    .slice(0, n);
}

// ---------- Loop-Durchläufe ----------

export interface StatCounts {
  correct: number;
  wrong: number;
  extra: number;
  missed: number;
}

export function countsOf(stats: Readonly<RunStats>): StatCounts {
  return {
    correct: stats.correctNotes,
    wrong: stats.wrongNotes,
    extra: stats.extraNotes,
    missed: stats.missedNotes,
  };
}

export interface PassSummary extends StatCounts {
  accuracy: number;
  /** Etwas gespielt und weder Fehler, Extra-Noten noch verpasste Noten */
  clean: boolean;
}

export function passSummary(before: StatCounts, after: StatCounts): PassSummary {
  const d = {
    correct: after.correct - before.correct,
    wrong: after.wrong - before.wrong,
    extra: after.extra - before.extra,
    missed: after.missed - before.missed,
  };
  return {
    ...d,
    accuracy: accuracy({ correctNotes: d.correct, wrongNotes: d.wrong, missedNotes: d.missed }),
    clean: d.correct > 0 && d.wrong === 0 && d.extra === 0 && d.missed === 0,
  };
}
