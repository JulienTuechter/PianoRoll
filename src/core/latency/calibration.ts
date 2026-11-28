/**
 * Latenz-Messtest: Die App klickt im festen Takt, man spielt auf jeden Klick eine Taste.
 * Der typische Versatz Anschlag − Klick (beide in performance.now-Millisekunden) ist die Gesamtlatenz
 * aus Audioausgabe (Klick wird später hörbar) und MIDI-Eingang (Anschlag kommt später an) – genau der Wert,
 * den die Performance-Wertung vom Anschlagszeitpunkt abziehen muss.
 */

export const LATENCY_MAX_MS = 200;

export interface CalibrationPlan {
  /** Zeitpunkt des ersten Klicks (performance.now) */
  startMs: number;
  beatMs: number;
  /** Klicks zum Einzählen (werden nicht ausgewertet) */
  countIn: number;
  /** Ausgewertete Klicks */
  measured: number;
}

export interface CalibrationResult {
  /** Median des Versatzes (positiv = Anschlag nach dem Klick) */
  offsetMs: number;
  /** Robuste Streuung (MAD · 1,4826) */
  spreadMs: number;
  /** Ausgewertete Anschläge / ausgewertete Klicks */
  used: number;
  total: number;
  /** Vorschlag für den Latenzausgleich (gerundet auf 5 ms, 0 … LATENCY_MAX_MS) */
  suggestedMs: number;
  /** Streuung zu groß oder zu wenige Anschläge: Ergebnis mit Vorsicht genießen */
  unreliable: boolean;
}

/** Mindestens so viele Anschläge braucht eine Auswertung. */
export const MIN_TAPS = 6;
/** Ab dieser Streuung gilt die Messung als ungenau. */
export const MAX_RELIABLE_SPREAD_MS = 35;

export function clickTimes(plan: CalibrationPlan): number[] {
  return Array.from({ length: plan.countIn + plan.measured }, (_, k) => plan.startMs + k * plan.beatMs);
}

/** Zeitpunkte der ausgewerteten Klicks (ohne Einzählen). */
export function measuredClicks(plan: CalibrationPlan): number[] {
  return clickTimes(plan).slice(plan.countIn);
}

/** Ende der Messung: ein halber Schlag nach dem letzten Klick (spätere Anschläge zählen nicht). */
export function planEndMs(plan: CalibrationPlan): number {
  return plan.startMs + (plan.countIn + plan.measured - 0.5) * plan.beatMs;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Ordnet jedem ausgewerteten Klick den nächstgelegenen Anschlag zu (höchstens einen, innerhalb ±45 % eines Schlags),
 * verwirft Ausreißer und liefert Median und Streuung. `null`, wenn zu wenige Anschläge passen.
 */
export function analyzeTaps(
  clicks: readonly number[],
  taps: readonly number[],
  beatMs: number,
): CalibrationResult | null {
  const window = beatMs * 0.45;
  const offsets: number[] = [];
  for (const c of clicks) {
    let best: number | null = null;
    for (const t of taps) {
      const d = t - c;
      if (Math.abs(d) <= window && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
    if (best !== null) offsets.push(best);
  }
  if (offsets.length < MIN_TAPS) return null;

  // Ausreißer (verpasster Schlag, doppelt angeschlagen) über die mittlere absolute Abweichung entfernen
  const m0 = median(offsets);
  const mad0 = median(offsets.map((o) => Math.abs(o - m0))) * 1.4826;
  const limit = Math.max(25, 3 * mad0);
  const kept = offsets.filter((o) => Math.abs(o - m0) <= limit);
  if (kept.length < MIN_TAPS) return null;

  const offsetMs = median(kept);
  const spreadMs = median(kept.map((o) => Math.abs(o - offsetMs))) * 1.4826;
  return {
    offsetMs: Math.round(offsetMs),
    spreadMs: Math.round(spreadMs),
    used: kept.length,
    total: clicks.length,
    suggestedMs: suggestLatency(offsetMs),
    unreliable: spreadMs > MAX_RELIABLE_SPREAD_MS || kept.length < clicks.length / 2,
  };
}

/** Versatz → Einstellwert: auf 5 ms gerundet, nicht negativ (zu frühes Spielen ist keine Latenz). */
export function suggestLatency(offsetMs: number): number {
  return Math.min(LATENCY_MAX_MS, Math.max(0, Math.round(offsetMs / 5) * 5));
}
