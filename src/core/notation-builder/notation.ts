import { keyTonicName, pc, speller, type MusicalKey } from '../key-detection/key';
import type { MeasureInfo } from '../note-event-model/tempo-map';
import type { Hand, NoteEvent } from '../note-event-model/types';

/** Notenwert: 1 = Ganze, 2 = Halbe, 4 = Viertel … */
export type NoteValue = '1' | '2' | '4' | '8' | '16' | '32';

export interface NotationEvent {
  /** Absolute Position in Ticks */
  startTick: number;
  durationTicks: number;
  rest: boolean;
  /** Tonhöhen im VexFlow-Format, z. B. "bb/4" (nach Tonart geschrieben), aufsteigend */
  keys: string[];
  midis: number[];
  value: NoteValue;
  dots: number;
  /** Ganztaktpause (wird in jeder Taktart als ganze Pause notiert) */
  wholeMeasureRest: boolean;
  /** Mit dem nächsten Ereignis derselben Notenzeile per Haltebogen verbunden */
  tieNext: boolean;
  /** IDs der zugrunde liegenden NoteEvents (für Hervorhebung beim Abspielen) */
  noteIds: string[];
}

export interface NotationMeasure {
  index: number;
  startTick: number;
  endTick: number;
  numerator: number;
  denominator: number;
  /** Taktart weicht vom vorherigen Takt ab (oder erster Takt) */
  timeSigChange: boolean;
  treble: NotationEvent[];
  bass: NotationEvent[];
}

export interface NotationScore {
  ppq: number;
  /** Tonart im VexFlow-Format, z. B. "Bb" oder "Gm" */
  keySpec: string;
  measures: NotationMeasure[];
}

export interface NotationOptions {
  key: MusicalKey | null;
  /** Rasterteilung pro Ganzer (16 = Sechzehntel) */
  grid?: number;
  /** Umrechnung Sekunden → Ticks für Noten ohne durationTicks */
  secToTick?: (sec: number) => number;
}

export function vexKeySpec(key: MusicalKey | null): string {
  if (!key) return 'C';
  return `${keyTonicName(key)}${key.mode === 'minor' ? 'm' : ''}`;
}

/** MIDI → VexFlow-Tonhöhe, z. B. 70 in F-Dur → "bb/4", 65 in F#-Dur → "e#/4" (Oktave nach Stammton) */
export function vexKey(midi: number, spell: (pc: number) => string): string {
  const name = spell(pc(midi));
  const letter = name[0]?.toLowerCase() ?? 'c';
  const acc = name.slice(1);
  const offset = [...acc].reduce((s, ch) => s + (ch === '#' ? 1 : ch === 'b' ? -1 : 0), 0);
  const octave = Math.floor((midi - offset) / 12) - 1;
  return `${letter}${acc}/${octave}`;
}

interface ValueDef {
  value: NoteValue;
  dots: number;
  ticks: number;
  /** Start muss auf einem Vielfachen davon liegen (verhindert z. B. punktierte Viertel auf der „und“) */
  align: number;
}

/** Alle darstellbaren Werte (inkl. einfach punktierter), absteigend. */
export function valueTable(ppq: number): ValueDef[] {
  const base: [NoteValue, number][] = [
    ['1', ppq * 4],
    ['2', ppq * 2],
    ['4', ppq],
    ['8', ppq / 2],
    ['16', ppq / 4],
    ['32', ppq / 8],
  ];
  const out: ValueDef[] = [];
  for (const [value, ticks] of base) {
    out.push({ value, dots: 1, ticks: ticks * 1.5, align: ticks });
    out.push({ value, dots: 0, ticks, align: ticks });
  }
  return out.filter((v) => Number.isInteger(v.ticks)).sort((a, b) => b.ticks - a.ticks);
}

/**
 * Zerlegt eine Dauer ab `offset` (Ticks seit Taktbeginn) in gültige Notenwerte – mit möglichst wenigen Teilen.
 * Regeln: Werte ab Schlaglänge beginnen auf einem Schlag, kürzere auf ihrem eigenen Raster;
 * in geraden Taktarten ab 4/4 wird die Taktmitte nicht überbunden (außer vom Taktanfang aus).
 * Beispiel 4/4: drei Schläge Pause ab Schlag 2 → Viertel + Halbe. 3/4: Halbe auf Schlag 2 bleibt eine Halbe.
 */
export function splitDuration(
  offset: number,
  length: number,
  ppq: number,
  meter: { numerator: number; denominator: number } = { numerator: 4, denominator: 4 },
): { value: NoteValue; dots: number; ticks: number }[] {
  const table = valueTable(ppq);
  const beat = (ppq * 4) / meter.denominator;
  const measure = beat * meter.numerator;
  const half = meter.numerator >= 4 && meter.numerator % 2 === 0 ? measure / 2 : null;
  const allowed = (v: ValueDef, pos: number) => {
    if (pos % Math.min(v.align, beat) !== 0) return false;
    if (half !== null && pos !== 0 && pos < half && pos + v.ticks > half) return false;
    return true;
  };
  const memo = new Map<number, ValueDef[] | null>();
  const solve = (pos: number, rest: number): ValueDef[] | null => {
    if (rest === 0) return [];
    const cached = memo.get(rest);
    if (cached !== undefined) return cached;
    let best: ValueDef[] | null = null;
    for (const v of table) {
      if (v.ticks > rest || !allowed(v, pos)) continue;
      const tail = solve(pos + v.ticks, rest - v.ticks);
      if (tail && (!best || tail.length + 1 < best.length)) best = [v, ...tail];
    }
    memo.set(rest, best);
    return best;
  };
  const parts = solve(offset, length);
  if (parts) return parts.map((v) => ({ value: v.value, dots: v.dots, ticks: v.ticks }));
  // Nicht exakt darstellbar (Rundungsrest): kleinste Werte auffüllen
  const smallest = table[table.length - 1]!;
  const out: { value: NoteValue; dots: number; ticks: number }[] = [];
  for (let r = length; r >= smallest.ticks; r -= smallest.ticks)
    out.push({ value: smallest.value, dots: 0, ticks: smallest.ticks });
  return out;
}

interface Chord {
  start: number;
  end: number;
  notes: NoteEvent[];
}

/** Rastert die Noten einer Hand und fasst gleichzeitig beginnende zu Akkorden zusammen (eine Stimme pro System). */
export function chordsForStaff(
  notes: readonly NoteEvent[],
  ppq: number,
  gridTicks: number,
  secToTick?: (sec: number) => number,
): Chord[] {
  const byStart = new Map<number, Chord>();
  for (const n of notes) {
    const start = Math.round(n.startTick / gridTicks) * gridTicks;
    const durTicks =
      n.durationTicks ?? (secToTick ? secToTick(n.startSec + n.durationSec) - secToTick(n.startSec) : ppq);
    let end = Math.round((n.startTick + durTicks) / gridTicks) * gridTicks;
    if (end <= start) end = start + gridTicks;
    const c = byStart.get(start);
    if (c) {
      c.notes.push(n);
      c.end = Math.max(c.end, end);
    } else byStart.set(start, { start, end, notes: [n] });
  }
  const chords = [...byStart.values()].sort((a, b) => a.start - b.start);
  // Eine Stimme: Akkord endet spätestens beim nächsten Anschlag
  for (let i = 0; i < chords.length - 1; i++) chords[i]!.end = Math.min(chords[i]!.end, chords[i + 1]!.start);
  return chords;
}

function buildStaffMeasures(
  chords: readonly Chord[],
  measures: readonly MeasureInfo[],
  measureEnds: readonly number[],
  ppq: number,
  spell: (pc: number) => string,
): NotationEvent[][] {
  const result: NotationEvent[][] = measures.map(() => []);
  let ci = 0;
  measures.forEach((m, mi) => {
    const mStart = m.startTick;
    const mEnd = measureEnds[mi]!;
    const events = result[mi]!;
    const pushRest = (from: number, to: number) => {
      for (const p of splitDuration(from - mStart, to - from, ppq, m)) {
        events.push({
          startTick: from,
          durationTicks: p.ticks,
          rest: true,
          keys: [],
          midis: [],
          value: p.value,
          dots: p.dots,
          wholeMeasureRest: false,
          tieNext: false,
          noteIds: [],
        });
        from += p.ticks;
      }
    };
    let cursor = mStart;
    while (ci > 0 && (chords[ci - 1]?.end ?? 0) > mStart && (chords[ci - 1]?.start ?? 0) < mStart) ci--; // über Taktstrich gehaltener Akkord
    for (let i = ci; i < chords.length; i++) {
      const c = chords[i]!;
      if (c.start >= mEnd) break;
      if (c.end <= mStart) {
        ci = i + 1;
        continue;
      }
      const segStart = Math.max(c.start, mStart);
      const segEnd = Math.min(c.end, mEnd);
      if (segStart > cursor) pushRest(cursor, segStart);
      const midis = [...new Set(c.notes.map((n) => n.midi))].sort((a, b) => a - b);
      const keys = midis.map((x) => vexKey(x, spell));
      const parts = splitDuration(segStart - mStart, segEnd - segStart, ppq, m);
      let t = segStart;
      parts.forEach((p, pi) => {
        events.push({
          startTick: t,
          durationTicks: p.ticks,
          rest: false,
          keys,
          midis,
          value: p.value,
          dots: p.dots,
          wholeMeasureRest: false,
          // Bogen innerhalb des Takts oder in den nächsten Takt
          tieNext: pi < parts.length - 1 || c.end > mEnd,
          noteIds: c.notes.map((n) => n.id),
        });
        t += p.ticks;
      });
      cursor = segEnd;
      if (c.end <= mEnd) ci = i + 1;
    }
    if (events.length === 0) {
      events.push({
        startTick: mStart,
        durationTicks: mEnd - mStart,
        rest: true,
        keys: [],
        midis: [],
        value: '1',
        dots: 0,
        wholeMeasureRest: true,
        tieNext: false,
        noteIds: [],
      });
    } else if (cursor < mEnd) pushRest(cursor, mEnd);
  });
  return result;
}

/**
 * Baut aus den Noten eines Stücks ein Klaviersystem (Violin- und Bassschlüssel) Takt für Takt.
 * Rechte Hand → oben, linke Hand → unten. Pro System eine Stimme (gleichzeitige Töne als Akkord).
 */
export function buildNotation(
  notes: readonly NoteEvent[],
  measures: readonly MeasureInfo[],
  ppq: number,
  options: NotationOptions,
): NotationScore {
  const gridTicks = Math.max(1, Math.round((ppq * 4) / (options.grid ?? 16)));
  const spell = speller(options.key);
  const measureEnds = measures.map(
    (m, i) => measures[i + 1]?.startTick ?? m.startTick + Math.round(ppq * m.numerator * (4 / m.denominator)),
  );
  const forHand = (h: Hand) =>
    buildStaffMeasures(
      chordsForStaff(
        notes.filter((n) => n.hand === h),
        ppq,
        gridTicks,
        options.secToTick,
      ),
      measures,
      measureEnds,
      ppq,
      spell,
    );
  const treble = forHand('right');
  const bass = forHand('left');
  return {
    ppq,
    keySpec: vexKeySpec(options.key),
    measures: measures.map((m, i) => {
      const prev = measures[i - 1];
      return {
        index: m.index,
        startTick: m.startTick,
        endTick: measureEnds[i]!,
        numerator: m.numerator,
        denominator: m.denominator,
        timeSigChange: !prev || prev.numerator !== m.numerator || prev.denominator !== m.denominator,
        treble: treble[i] ?? [],
        bass: bass[i] ?? [],
      };
    }),
  };
}
