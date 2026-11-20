import { keyTonicName, pc, speller, type MusicalKey } from '../key-detection/key';
import type { MeasureInfo } from '../note-event-model/tempo-map';
import type { ChordQuality } from '../chord-detection/chord';
import type { Hand, NoteEvent, PedalSpan } from '../note-event-model/types';

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
  /** Triole: Gruppen-ID (Tick des Schlagbeginns) – Ereignisse mit gleicher ID bilden eine „3“ */
  tuplet: number | null;
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
  /** Erste (bei zwei Stimmen: obere, Hälse nach oben) Stimme je System */
  treble: NotationEvent[];
  bass: NotationEvent[];
  /** Zweite Stimme (Hälse nach unten); leer, wenn das System im Takt einstimmig ist */
  treble2: NotationEvent[];
  bass2: NotationEvent[];
  /** Akkordsymbole über dem System, Ticks absolut */
  chords: ChordLabel[];
  /** Dynamikzeichen am Taktanfang (nur bei Änderung) */
  dynamic: DynamicMark | null;
}

export type DynamicMark = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff';

export interface ChordLabel {
  tick: number;
  /** Anzeige, z. B. „B♭m7/F“ */
  label: string;
  /** Für MusicXML: Grundton/Bass als Notenname („Bb“), Akkordart und Suffix */
  root: string;
  bass: string;
  quality: ChordQuality;
  suffix: string;
}

export interface NotationScore {
  ppq: number;
  /** Tonart im VexFlow-Format, z. B. "Bb" oder "Gm" */
  keySpec: string;
  measures: NotationMeasure[];
  /** Haltepedal, auf das Raster gesetzt */
  pedals: PedalSpan[];
}

export interface NotationOptions {
  key: MusicalKey | null;
  /** Rasterteilung pro Ganzer (16 = Sechzehntel) */
  grid?: number;
  /** Umrechnung Sekunden → Ticks für Noten ohne durationTicks */
  secToTick?: (sec: number) => number;
  /** Akkordsymbole (absolute Ticks) */
  chords?: readonly ChordLabel[];
  /** Haltepedal */
  pedals?: readonly PedalSpan[];
  /** Dynamik aus den Anschlagstärken ableiten */
  dynamics?: boolean;
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
  /** Noten: ungepunktete Werte, die auf einem Schlag beginnen, dürfen die Taktmitte überbrücken (Synkope ♩ 𝅗𝅥 ♩) */
  allowSyncopation = false,
): { value: NoteValue; dots: number; ticks: number }[] {
  const table = valueTable(ppq);
  const beat = (ppq * 4) / meter.denominator;
  const measure = beat * meter.numerator;
  const half = meter.numerator >= 4 && meter.numerator % 2 === 0 ? measure / 2 : null;
  const allowed = (v: ValueDef, pos: number) => {
    if (pos % Math.min(v.align, beat) !== 0) return false;
    if (half !== null && pos !== 0 && pos < half && pos + v.ticks > half) {
      if (!(allowSyncopation && v.dots === 0 && pos % beat === 0)) return false;
    }
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

interface Snapped {
  n: NoteEvent;
  start: number;
  end: number;
}

/** Anfang und Ende jeder Note aufs Raster (Triolenraster nur, wenn es klar besser passt). */
function snapNotes(
  notes: readonly NoteEvent[],
  ppq: number,
  gridTicks: number,
  secToTick?: (sec: number) => number,
): Snapped[] {
  // Triolenraster nur, wenn ein Wert dort klar besser und fast exakt liegt (keine Schein-Triolen aus ungenauen Dateien)
  const tripletGrid = ppq / 6;
  const snapTick = (t: number) => {
    const s = Math.round(t / gridTicks) * gridTicks;
    const tr = Math.round(t / tripletGrid) * tripletGrid;
    return Math.abs(t - tr) < Math.abs(t - s) && Math.abs(t - tr) <= ppq / 24 ? tr : s;
  };
  return notes.map((n) => {
    const start = snapTick(n.startTick);
    const durTicks =
      n.durationTicks ?? (secToTick ? secToTick(n.startSec + n.durationSec) - secToTick(n.startSec) : ppq);
    let end = snapTick(n.startTick + durTicks);
    if (end <= start) end = start + gridTicks;
    return { n, start, end };
  });
}

function groupByStart(snapped: readonly Snapped[]): Map<number, Snapped[]> {
  const byStart = new Map<number, Snapped[]>();
  for (const s of snapped) {
    const g = byStart.get(s.start);
    if (g) g.push(s);
    else byStart.set(s.start, [s]);
  }
  return new Map([...byStart].sort((a, b) => a[0] - b[0]));
}

const maxEnd = (g: readonly Snapped[]) => g.reduce((m, s) => Math.max(m, s.end), -Infinity);

/** Rastert die Noten einer Hand und fasst gleichzeitig beginnende zu Akkorden zusammen (eine Stimme). */
export function chordsForStaff(
  notes: readonly NoteEvent[],
  ppq: number,
  gridTicks: number,
  secToTick?: (sec: number) => number,
): Chord[] {
  const chords = [...groupByStart(snapNotes(notes, ppq, gridTicks, secToTick))].map(([start, g]) => ({
    start,
    end: maxEnd(g),
    notes: g.map((s) => s.n),
  }));
  // Eine Stimme: Akkord endet spätestens beim nächsten Anschlag
  for (let i = 0; i < chords.length - 1; i++) chords[i]!.end = Math.min(chords[i]!.end, chords[i + 1]!.start);
  return chords;
}

const meanPitch = (notes: readonly NoteEvent[]) => notes.reduce((s, n) => s + n.midi, 0) / notes.length;

/**
 * Verteilt die Noten einer Hand auf höchstens zwei Stimmen.
 * Eine Note bekommt eine eigene Stimme, wenn sie deutlich (≥ Achtel) über den nächsten Anschlag hinaus klingt und
 * währenddessen mindestens ein späterer Anschlag vollständig erklingt – gehaltener Basston unter einer Begleitfigur,
 * liegende Melodienote über Mittelstimmen. Leichtes Legato-Überlappen bleibt einstimmig (wird gekürzt).
 * Eine dritte gleichzeitige Stimme wird wie bisher am nächsten Anschlag gekürzt.
 */
export function voicesForStaff(
  notes: readonly NoteEvent[],
  ppq: number,
  gridTicks: number,
  secToTick?: (sec: number) => number,
): [Chord[], Chord[]] {
  const groups = [...groupByStart(snapNotes(notes, ppq, gridTicks, secToTick))];
  const minEnds = groups.map(([, g]) => g.reduce((m, s) => Math.min(m, s.end), Infinity));
  const hold = ppq / 2;

  const units: Chord[] = [];
  groups.forEach(([start, g], gi) => {
    const next = groups[gi + 1]?.[0] ?? Infinity;
    const held = (s: Snapped) => {
      if (next === Infinity || s.end - next < hold) return false;
      for (let k = gi + 1; k < groups.length && groups[k]![0] < s.end; k++)
        if (minEnds[k]! <= s.end) return true;
      return false;
    };
    const long = g.filter(held);
    const short = g.filter((s) => !held(s));
    if (long.length) units.push({ start, end: maxEnd(long), notes: long.map((s) => s.n) });
    if (short.length) units.push({ start, end: Math.min(maxEnd(short), next), notes: short.map((s) => s.n) });
  });

  type Layer = { chords: Chord[]; end: number; pitch: number | null };
  const layers: [Layer, Layer] = [
    { chords: [], end: -Infinity, pitch: null },
    { chords: [], end: -Infinity, pitch: null },
  ];
  for (const u of units) {
    const p = meanPitch(u.notes);
    const free = layers.filter((l) => l.end <= u.start);
    let target: Layer;
    if (free.length === 2) {
      // Stimmführung: in die Stimme, deren letzte Töne am nächsten liegen
      const dist = (l: Layer) => (l.pitch === null ? Infinity : Math.abs(l.pitch - p));
      target = dist(layers[1]) < dist(layers[0]) ? layers[1] : layers[0];
    } else if (free.length === 1) target = free[0]!;
    else {
      // Beide Stimmen belegt: die früher endende kürzen (bzw. bei gleichem Anfang zum Akkord machen)
      target = layers[0].end <= layers[1].end ? layers[0] : layers[1];
      const last = target.chords[target.chords.length - 1]!;
      if (last.start === u.start) {
        last.notes.push(...u.notes);
        last.end = Math.min(last.end, u.end);
        target.end = last.end;
        target.pitch = meanPitch(last.notes);
        continue;
      }
      last.end = u.start;
    }
    target.chords.push(u);
    target.end = u.end;
    target.pitch = p;
  }
  return [layers[0].chords, layers[1].chords];
}

type Piece = { value: NoteValue; dots: number; ticks: number; tuplet: number | null };

/**
 * Schläge mit Triolen: Ein Anfang oder Ende liegt auf dem Triolenraster (ppq/6), aber nicht auf dem
 * geraden Raster (ppq/8). Rückgabe: Indizes der Schläge im Takt.
 */
export function tripletBeats(
  boundaries: readonly number[],
  mStart: number,
  mEnd: number,
  ppq: number,
  beat: number,
): Set<number> {
  const out = new Set<number>();
  const straight = ppq / 8;
  const trip = ppq / 6;
  for (const b of boundaries) {
    if (b <= mStart || b >= mEnd) continue;
    const rel = b - mStart;
    if (rel % straight !== 0 && rel % trip === 0) out.add(Math.floor(rel / beat));
  }
  return out;
}

/** Zerlegung innerhalb eines Triolenschlags: Viertel-, Achtel- und Sechzehnteltriolen. */
function tripletPieces(from: number, to: number, beatStart: number, ppq: number): Piece[] {
  const u = ppq / 3;
  const out: Piece[] = [];
  let t = from;
  while (to - t > 0) {
    const rel = t - beatStart;
    let p: Piece;
    if (to - t >= 2 * u && rel % u === 0) p = { value: '4', dots: 0, ticks: 2 * u, tuplet: beatStart };
    else if (to - t >= u && rel % u === 0) p = { value: '8', dots: 0, ticks: u, tuplet: beatStart };
    else p = { value: '16', dots: 0, ticks: Math.min(u / 2, to - t), tuplet: beatStart };
    out.push(p);
    t += p.ticks;
  }
  return out;
}

const inRange = (chords: readonly Chord[], from: number, to: number) =>
  chords.filter((c) => c.start < to && c.end > from);

/** Notenereignisse einer Stimme in einem Takt (Lücken als Pausen, leerer Takt als Ganztaktpause). */
function measureEvents(
  chords: readonly Chord[],
  m: MeasureInfo,
  mEnd: number,
  ppq: number,
  spell: (pc: number) => string,
): NotationEvent[] {
  const mStart = m.startTick;
  const events: NotationEvent[] = [];
  const beat = (ppq * 4) / m.denominator;
  const triplets = tripletBeats(
    chords.flatMap((c) => [c.start, c.end]),
    mStart,
    mEnd,
    ppq,
    beat,
  );

  /** Bereich in Notenwerte zerlegen – gerade Abschnitte über splitDuration, Triolenschläge einzeln */
  const pieces = (from: number, to: number, isNote: boolean): Piece[] => {
    const out: Piece[] = [];
    let t = from;
    while (t < to) {
      const bi = Math.floor((t - mStart) / beat);
      const beatStart = mStart + bi * beat;
      if (triplets.has(bi)) {
        const segEnd = Math.min(to, beatStart + beat);
        out.push(...tripletPieces(t, segEnd, beatStart, ppq));
        t = segEnd;
        continue;
      }
      let runEnd = to;
      for (let k = bi + 1; mStart + k * beat < to; k++) {
        if (triplets.has(k)) {
          runEnd = mStart + k * beat;
          break;
        }
      }
      out.push(...splitDuration(t - mStart, runEnd - t, ppq, m, isNote).map((p) => ({ ...p, tuplet: null })));
      t = runEnd;
    }
    return out;
  };

  const pushRest = (from: number, to: number) => {
    for (const p of pieces(from, to, false)) {
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
        tuplet: p.tuplet,
        noteIds: [],
      });
      from += p.ticks;
    }
  };

  let cursor = mStart;
  for (const c of chords) {
    const segStart = Math.max(c.start, mStart);
    const segEnd = Math.min(c.end, mEnd);
    if (segEnd <= cursor) continue;
    if (segStart > cursor) pushRest(cursor, segStart);
    const midis = [...new Set(c.notes.map((n) => n.midi))].sort((a, b) => a - b);
    const keys = midis.map((x) => vexKey(x, spell));
    const parts = pieces(Math.max(segStart, cursor), segEnd, true);
    let t = Math.max(segStart, cursor);
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
        tuplet: p.tuplet,
        noteIds: c.notes.map((n) => n.id),
      });
      t += p.ticks;
    });
    cursor = segEnd;
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
      tuplet: null,
      noteIds: [],
    });
  } else if (cursor < mEnd) pushRest(cursor, mEnd);
  return events;
}

/** Klingen in diesem Takt Akkorde beider Stimmen gleichzeitig? */
function overlapsIn(a: readonly Chord[], b: readonly Chord[], from: number, to: number): boolean {
  for (const x of a)
    for (const y of b) if (Math.max(x.start, y.start, from) < Math.min(x.end, y.end, to)) return true;
  return false;
}

/** Takte eines Systems: einstimmig, oder zwei Stimmen (obere zuerst), wo sie wirklich gleichzeitig klingen. */
function staffMeasures(
  [a, b]: [Chord[], Chord[]],
  measures: readonly MeasureInfo[],
  measureEnds: readonly number[],
  ppq: number,
  spell: (pc: number) => string,
): [NotationEvent[], NotationEvent[]][] {
  return measures.map((m, mi) => {
    const mEnd = measureEnds[mi]!;
    const ca = inRange(a, m.startTick, mEnd);
    const cb = inRange(b, m.startTick, mEnd);
    if (ca.length === 0 || cb.length === 0 || !overlapsIn(ca, cb, m.startTick, mEnd)) {
      const merged = [...ca, ...cb].sort((x, y) => x.start - y.start);
      return [measureEvents(merged, m, mEnd, ppq, spell), []];
    }
    const pa = meanPitch(ca.flatMap((c) => c.notes));
    const pb = meanPitch(cb.flatMap((c) => c.notes));
    const [upper, lower] = pa >= pb ? [ca, cb] : [cb, ca];
    return [measureEvents(upper, m, mEnd, ppq, spell), measureEvents(lower, m, mEnd, ppq, spell)];
  });
}

/** Anschlagstärke (0..1) → Dynamikstufe */
export function dynamicLevel(velocity: number): DynamicMark {
  if (velocity < 0.3) return 'pp';
  if (velocity < 0.45) return 'p';
  if (velocity < 0.58) return 'mp';
  if (velocity < 0.72) return 'mf';
  if (velocity < 0.86) return 'f';
  return 'ff';
}

const LEVELS: DynamicMark[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];

/**
 * Dynamikzeichen pro Takt aus der mittleren Anschlagstärke. Nur bei Stücken mit echten Lautstärkeunterschieden
 * (sonst wären es Dateien mit fester Velocity). Gesetzt wird am ersten Takt und bei Wechseln, die mindestens zwei
 * Takte anhalten oder einen Sprung um zwei Stufen machen.
 */
export function dynamicsByMeasure(
  notes: readonly NoteEvent[],
  measures: readonly MeasureInfo[],
  measureEnds: readonly number[],
): (DynamicMark | null)[] {
  const out: (DynamicMark | null)[] = measures.map(() => null);
  if (notes.length === 0) return out;
  const vs = notes.map((n) => n.velocity);
  if (Math.max(...vs) - Math.min(...vs) < 0.08) return out;

  const levels: (number | null)[] = measures.map((m, i) => {
    const inM = notes.filter((n) => n.startTick >= m.startTick && n.startTick < measureEnds[i]!);
    if (inM.length === 0) return null;
    return LEVELS.indexOf(dynamicLevel(inM.reduce((s, n) => s + n.velocity, 0) / inM.length));
  });
  let current: number | null = null;
  levels.forEach((lv, i) => {
    if (lv === null || lv === current) return;
    const nextLv = levels.slice(i + 1).find((x) => x !== null);
    if (current === null || Math.abs(lv - current) >= 2 || nextLv === lv) {
      out[i] = LEVELS[lv]!;
      current = lv;
    }
  });
  return out;
}

/**
 * Baut aus den Noten eines Stücks ein Klaviersystem (Violin- und Bassschlüssel) Takt für Takt.
 * Rechte Hand → oben, linke Hand → unten; pro System bis zu zwei Stimmen.
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
    staffMeasures(
      voicesForStaff(
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
  const dynamics = options.dynamics ? dynamicsByMeasure(notes, measures, measureEnds) : [];
  const snap = (t: number) => Math.round(t / gridTicks) * gridTicks;
  const scoreEnd = measureEnds[measureEnds.length - 1] ?? 0;
  const chords = (options.chords ?? []).map((c) => ({ ...c, tick: snap(c.tick) }));
  const pedals = (options.pedals ?? [])
    .map((p) => ({ startTick: snap(p.startTick), endTick: Math.min(scoreEnd, snap(p.endTick)) }))
    .filter((p) => p.endTick > p.startTick);
  return {
    ppq,
    keySpec: vexKeySpec(options.key),
    pedals,
    measures: measures.map((m, i) => {
      const prev = measures[i - 1];
      const end = measureEnds[i]!;
      return {
        index: m.index,
        startTick: m.startTick,
        endTick: end,
        numerator: m.numerator,
        denominator: m.denominator,
        timeSigChange: !prev || prev.numerator !== m.numerator || prev.denominator !== m.denominator,
        treble: treble[i]?.[0] ?? [],
        bass: bass[i]?.[0] ?? [],
        treble2: treble[i]?.[1] ?? [],
        bass2: bass[i]?.[1] ?? [],
        chords: chords.filter((c) => c.tick >= m.startTick && c.tick < end),
        dynamic: dynamics[i] ?? null,
      };
    }),
  };
}
