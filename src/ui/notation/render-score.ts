import type { NotationEvent, NotationScore } from '../../core/notation-builder/notation';

export interface MeasureBox {
  index: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  startTick: number;
  endTick: number;
}

export interface CursorPoint {
  tick: number;
  x: number;
  row: number;
}

export interface ScoreLayout {
  width: number;
  height: number;
  rows: { y: number; h: number }[];
  measures: MeasureBox[];
  /** nach Tick sortiert: Anschlagspunkte + Taktgrenzen, für den mitlaufenden Cursor */
  points: CursorPoint[];
  /** NoteEvent-ID → SVG-Gruppen (für Hervorhebung beim Abspielen) */
  noteEls: Map<string, SVGElement[]>;
}

const MARGIN_X = 12;
const ROW_HEIGHT = 230;
const BASS_OFFSET = 100;
const TOP_PAD = 10;

type VF = typeof import('vexflow/bravura');
let vfPromise: Promise<VF> | null = null;

/** VexFlow erst bei Bedarf laden (eigener Chunk inkl. eingebetteter Bravura-Schrift). */
function loadVexFlow(): Promise<VF> {
  vfPromise ??= import('vexflow/bravura').then(async (vf) => {
    try {
      await document.fonts.load('30px Bravura');
    } catch {
      /* Schrift lädt evtl. erst beim Zeichnen – kein Abbruch */
    }
    return vf;
  });
  return vfPromise;
}

type Measure = NotationScore['measures'][number];
type StaffName = 'treble' | 'bass';

const allEvents = (m: Measure) => [...m.treble, ...m.treble2, ...m.bass, ...m.bass2];

function minMeasureWidth(m: Measure, firstInRow: boolean): number {
  const events = Math.max(m.treble.length, m.treble2.length, m.bass.length, m.bass2.length);
  const accidentals = allEvents(m).some((e) => e.keys.some((k) => /^[a-g](#|b)/.test(k))) ? 12 : 0;
  // Akkordsymbole brauchen Platz nebeneinander
  const chords = m.chords.reduce((w, c) => w + 9 * c.label.length + 8, 0);
  return (
    Math.max(50 + 30 * events + accidentals, chords) + (firstInRow ? 100 : 0) + (m.timeSigChange ? 30 : 0)
  );
}

/**
 * Schlüssel des unteren Systems einer Zeile: Spielt die linke Hand dort überwiegend ab H3 aufwärts,
 * steht sie im Violinschlüssel (sonst lägen alle Noten auf Hilfslinien über dem Bassschlüssel).
 */
export function lowerStaffClef(measures: readonly Measure[]): StaffName {
  const midis = measures.flatMap((m) => [...m.bass, ...m.bass2].flatMap((e) => (e.rest ? [] : e.midis)));
  if (midis.length === 0) return 'bass';
  const sorted = [...midis].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.2)]! >= 59 ? 'treble' : 'bass';
}

/** Pausenlage: bei zwei Stimmen ober- bzw. unterhalb der Mitte, sonst Mittellinie */
function restKey(clef: StaffName, voice: 0 | 1 | null): string {
  if (clef === 'treble') return voice === 0 ? 'e/5' : voice === 1 ? 'f/4' : 'b/4';
  return voice === 0 ? 'g/3' : voice === 1 ? 'a/2' : 'd/3';
}

/** Klaviersystem zeilenweise als SVG zeichnen. */
export async function renderScore(
  container: HTMLElement,
  score: NotationScore,
  width: number,
): Promise<ScoreLayout> {
  const VF = await loadVexFlow();
  const {
    Renderer,
    Stave,
    StaveNote,
    Voice,
    Formatter,
    Accidental,
    Beam,
    StaveTie,
    StaveConnector,
    Dot,
    BarlineType,
    Tuplet,
  } = VF;

  // Zeilen packen
  const avail = Math.max(200, width - 2 * MARGIN_X);
  const rowsIdx: number[][] = [];
  let cur: number[] = [];
  let used = 0;
  score.measures.forEach((m, i) => {
    const w = minMeasureWidth(m, cur.length === 0);
    if (cur.length > 0 && used + w > avail) {
      rowsIdx.push(cur);
      cur = [];
      used = 0;
    }
    cur.push(i);
    used += cur.length === 1 ? minMeasureWidth(m, true) : w;
  });
  if (cur.length) rowsIdx.push(cur);

  const height = rowsIdx.length * ROW_HEIGHT + TOP_PAD * 2;
  container.innerHTML = '';
  const renderer = new Renderer(container as HTMLDivElement, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const layout: ScoreLayout = { width, height, rows: [], measures: [], points: [], noteEls: new Map() };
  type Placed = { e: NotationEvent; note: InstanceType<typeof StaveNote>; row: number };
  const staffNotes: Record<StaffName, Placed[]> = { treble: [], bass: [] };
  const staves: {
    m: Measure;
    row: number;
    ts: InstanceType<typeof Stave>;
    bs: InstanceType<typeof Stave>;
  }[] = [];

  rowsIdx.forEach((row, r) => {
    const lowerClef = lowerStaffClef(row.map((mi) => score.measures[mi]!));
    const y = TOP_PAD + r * ROW_HEIGHT;
    layout.rows.push({ y, h: ROW_HEIGHT });
    const mins = row.map((mi, k) => minMeasureWidth(score.measures[mi]!, k === 0));
    const sum = mins.reduce((a, b) => a + b, 0);
    const isLast = r === rowsIdx.length - 1;
    // Letzte Zeile nur strecken, wenn sie schon gut gefüllt ist
    const scale = isLast && sum < avail * 0.6 ? 1.15 : avail / sum;
    let x = MARGIN_X;
    row.forEach((mi, k) => {
      const m = score.measures[mi]!;
      const w = mins[k]! * scale;
      const ts = new Stave(x, y, w);
      const bs = new Stave(x, y + BASS_OFFSET, w);
      if (k === 0) {
        ts.addClef('treble').addKeySignature(score.keySpec);
        bs.addClef(lowerClef).addKeySignature(score.keySpec);
      }
      if (m.timeSigChange) {
        ts.addTimeSignature(`${m.numerator}/${m.denominator}`);
        bs.addTimeSignature(`${m.numerator}/${m.denominator}`);
      }
      if (mi === score.measures.length - 1) {
        ts.setEndBarType(BarlineType.END);
        bs.setEndBarType(BarlineType.END);
      }
      const startX = Math.max(ts.getNoteStartX(), bs.getNoteStartX());
      ts.setNoteStartX(startX);
      bs.setNoteStartX(startX);
      ts.setContext(ctx).draw();
      bs.setContext(ctx).draw();
      if (k === 0) {
        new StaveConnector(ts, bs).setType('brace').setContext(ctx).draw();
        new StaveConnector(ts, bs).setType('singleLeft').setContext(ctx).draw();
      }
      new StaveConnector(ts, bs)
        .setType(mi === score.measures.length - 1 ? 'boldDoubleRight' : 'singleRight')
        .setContext(ctx)
        .draw();

      // Stimme 0 = obere (bzw. einzige), 1 = untere; bei zwei Stimmen feste Halsrichtung
      const make = (e: NotationEvent, clef: StaffName, voice: 0 | 1 | null) => {
        const note = new StaveNote({
          keys: e.rest ? [restKey(clef, voice)] : e.keys,
          duration: e.value,
          dots: e.dots,
          type: e.rest ? 'r' : undefined,
          clef,
          autoStem: voice === null,
          ...(voice !== null ? { stemDirection: voice === 0 ? 1 : -1 } : {}),
        });
        if (e.dots > 0) Dot.buildAndAttach([note], { all: true });
        return note;
      };
      // Triolen: aufeinanderfolgende Ereignisse derselben Gruppe → „3 im Raum von 2“ (vor dem Formatieren!)
      const tuplets: InstanceType<typeof Tuplet>[] = [];
      const groupTuplets = (
        events: NotationEvent[],
        notes: InstanceType<typeof StaveNote>[],
        voice: 0 | 1 | null,
      ) => {
        let i = 0;
        while (i < events.length) {
          const g = events[i]!.tuplet;
          if (g === null) {
            i++;
            continue;
          }
          let j = i;
          while (j < events.length && events[j]!.tuplet === g) j++;
          tuplets.push(
            new Tuplet(notes.slice(i, j), {
              numNotes: 3,
              notesOccupied: 2,
              bracketed: true,
              ratioed: false,
              ...(voice === 1 ? { location: -1 } : {}),
            }),
          );
          i = j;
        }
      };
      type VoicePlan = {
        events: NotationEvent[];
        notes: InstanceType<typeof StaveNote>[];
        voice: InstanceType<typeof Voice>;
        stem: 0 | 1 | null;
      };
      const plan = (clef: StaffName, first: NotationEvent[], second: NotationEvent[]): VoicePlan[] => {
        const two = second.length > 0;
        return (two ? [first, second] : [first]).map((events, k) => {
          const stem: 0 | 1 | null = two ? (k as 0 | 1) : null;
          const notes = events.map((e) => make(e, clef, stem));
          groupTuplets(events, notes, stem);
          const voice = new Voice({ numBeats: m.numerator, beatValue: m.denominator })
            .setMode(Voice.Mode.SOFT)
            .addTickables(notes);
          return { events, notes, voice, stem };
        });
      };
      const tv = plan('treble', m.treble, m.treble2);
      const bv = plan(lowerClef, m.bass, m.bass2);
      Accidental.applyAccidentals(
        tv.map((p) => p.voice),
        score.keySpec,
      );
      Accidental.applyAccidentals(
        bv.map((p) => p.voice),
        score.keySpec,
      );
      new Formatter()
        .joinVoices(tv.map((p) => p.voice))
        .joinVoices(bv.map((p) => p.voice))
        .format(
          [...tv, ...bv].map((p) => p.voice),
          Math.max(20, ts.getNoteEndX() - startX - 12),
        );
      const beams = [...tv, ...bv].flatMap((p) =>
        Beam.generateBeams(
          p.notes.filter((_, i) => !p.events[i]!.rest),
          p.stem === null ? {} : { maintainStemDirections: true },
        ),
      );
      for (const p of tv) p.voice.draw(ctx, ts);
      for (const p of bv) p.voice.draw(ctx, bs);
      for (const b of beams) b.setContext(ctx).draw();
      for (const t of tuplets) t.setContext(ctx).draw();

      const collect = (plans: VoicePlan[], staff: StaffName) => {
        for (const p of plans) {
          p.events.forEach((e, i) => {
            const note = p.notes[i]!;
            staffNotes[staff].push({ e, note, row: r });
            layout.points.push({ tick: e.startTick, x: note.getAbsoluteX() + 6, row: r });
            const el = note.getSVGElement();
            if (el) {
              for (const id of e.noteIds) {
                const list = layout.noteEls.get(id);
                if (list) list.push(el);
                else layout.noteEls.set(id, [el]);
              }
            }
          });
        }
      };
      collect(tv, 'treble');
      collect(bv, 'bass');
      staves.push({ m, row: r, ts, bs });
      layout.points.push({ tick: m.endTick, x: x + w - 4, row: r });
      layout.measures.push({
        index: m.index,
        row: r,
        x,
        y,
        w,
        h: BASS_OFFSET + 90,
        startTick: m.startTick,
        endTick: m.endTick,
      });
      x += w;
    });
  });

  // Haltebögen (zeilenübergreifend als zwei halbe Bögen). Folgenote: im selben System, beginnt am Ende der Note
  // und enthält dieselbe Tonhöhe – unabhängig von der Stimme (Stimmen können taktweise wechseln)
  for (const staff of ['treble', 'bass'] as const) {
    const byStart = new Map<number, Placed[]>();
    for (const p of staffNotes[staff]) {
      if (p.e.rest) continue;
      const list = byStart.get(p.e.startTick);
      if (list) list.push(p);
      else byStart.set(p.e.startTick, [p]);
    }
    for (const p of staffNotes[staff]) {
      if (!p.e.tieNext || p.e.rest) continue;
      const candidates = byStart.get(p.e.startTick + p.e.durationTicks) ?? [];
      const next = candidates.find((c) => c.e.midis.some((x) => p.e.midis.includes(x)));
      if (!next) continue;
      const first: number[] = [];
      const last: number[] = [];
      p.e.midis.forEach((m, fi) => {
        const li = next.e.midis.indexOf(m);
        if (li >= 0) {
          first.push(fi);
          last.push(li);
        }
      });
      if (next.row === p.row) {
        new StaveTie({ firstNote: p.note, lastNote: next.note, firstIndexes: first, lastIndexes: last })
          .setContext(ctx)
          .draw();
      } else {
        new StaveTie({ firstNote: p.note, lastNote: null, firstIndexes: first, lastIndexes: first })
          .setContext(ctx)
          .draw();
        new StaveTie({ firstNote: null, lastNote: next.note, firstIndexes: last, lastIndexes: last })
          .setContext(ctx)
          .draw();
      }
    }
  }

  drawMarks(ctx, score, staves, layout);

  layout.points = normalizePoints(layout.points);
  return layout;
}

/**
 * Nach Tick sortieren und gleiche Ticks derselben Zeile (beide Systeme) zusammenfassen.
 * Am Zeilenumbruch bleiben beide Punkte erhalten (Zeilenende + Anfang der nächsten Zeile), der spätere Zeilen-
 * index steht hinten – so läuft der Cursor bis zum Taktstrich und springt dann in die neue Zeile.
 */
export function normalizePoints(points: CursorPoint[]): CursorPoint[] {
  const sorted = [...points].sort((a, b) => a.tick - b.tick || a.row - b.row || a.x - b.x);
  return sorted.filter((p, i) => {
    const prev = sorted[i - 1];
    return !prev || prev.tick !== p.tick || prev.row !== p.row;
  });
}

/** Cursor-Position (x, Zeile) zu einem Tick: lineare Interpolation zwischen Anschlagspunkten. */
export function cursorAt(points: readonly CursorPoint[], tick: number): { x: number; row: number } | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  if (tick <= points[0]!.tick) return { x: points[0]!.x, row: points[0]!.row };
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (points[mid]!.tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo]!;
  const b = points[lo + 1];
  if (!b) return { x: a.x, row: a.row };
  if (b.row !== a.row) return { x: a.x, row: a.row };
  const t = (tick - a.tick) / Math.max(1, b.tick - a.tick);
  return { x: a.x + (b.x - a.x) * t, row: a.row };
}

type Ctx = ReturnType<InstanceType<VF['Renderer']>['getContext']>;
type StaveLike = { getYForLine(line: number): number };

/** x-Position eines Ticks in einer Zeile (zwischen den Anschlagspunkten interpoliert) */
export function xInRow(points: readonly CursorPoint[], row: number, tick: number): number | null {
  const pts = points.filter((p) => p.row === row);
  if (pts.length === 0) return null;
  let a = pts[0]!;
  if (tick <= a.tick) return a.x;
  for (const b of pts.slice(1)) {
    if (tick <= b.tick) return a.x + ((b.x - a.x) * (tick - a.tick)) / Math.max(1, b.tick - a.tick);
    a = b;
  }
  return a.x;
}

/** Akkordsymbole (über dem Violinsystem), Dynamik (zwischen den Systemen) und Haltepedal (unter dem Bass). */
function drawMarks(
  ctx: Ctx,
  score: NotationScore,
  staves: { m: Measure; row: number; ts: StaveLike; bs: StaveLike }[],
  layout: ScoreLayout,
): void {
  const points = normalizePoints(layout.points);
  ctx.save();
  for (const { m, row, ts, bs } of staves) {
    ctx.setFont('Arial, sans-serif', 13, 'bold');
    for (const c of m.chords) {
      const x = xInRow(points, row, c.tick);
      if (x !== null) ctx.fillText(c.label, x - 4, ts.getYForLine(0) - 22);
    }
    if (m.dynamic) {
      const box = layout.measures.find((b) => b.index === m.index && b.row === row);
      const x = xInRow(points, row, m.startTick) ?? box?.x ?? 0;
      ctx.setFont('Times New Roman, serif', 17, 'bold italic');
      ctx.fillText(m.dynamic, x - 4, (ts.getYForLine(4) + bs.getYForLine(0)) / 2 + 6);
    }
  }
  // Pedal: „Ped.“ am Anfang, Linie bis zum Loslassen, Haken nach oben; über Zeilenumbrüche hinweg fortgesetzt
  const rowStaves = new Map<number, StaveLike>();
  for (const s of staves) if (!rowStaves.has(s.row)) rowStaves.set(s.row, s.bs);
  const rowRange = new Map<number, { from: number; to: number }>();
  for (const b of layout.measures) {
    const r = rowRange.get(b.row);
    rowRange.set(b.row, {
      from: Math.min(r?.from ?? Infinity, b.startTick),
      to: Math.max(r?.to ?? -Infinity, b.endTick),
    });
  }
  ctx.setLineWidth(1.2);
  for (const p of score.pedals) {
    for (const [row, range] of rowRange) {
      const from = Math.max(p.startTick, range.from);
      const to = Math.min(p.endTick, range.to);
      const bs = rowStaves.get(row);
      if (to <= from || !bs) continue;
      const x1 = xInRow(points, row, from);
      const x2 = xInRow(points, row, to);
      if (x1 === null || x2 === null) continue;
      const y = bs.getYForLine(4) + 38;
      let lineStart = x1;
      if (from === p.startTick) {
        ctx.setFont('Times New Roman, serif', 13, 'bold italic');
        ctx.fillText('Ped.', x1 - 4, y + 4);
        lineStart = x1 + 26;
      }
      const end = to === p.endTick ? x2 - 3 : x2;
      if (end > lineStart) {
        ctx.beginPath();
        ctx.moveTo(lineStart, y);
        ctx.lineTo(end, y);
        if (to === p.endTick) ctx.lineTo(end, y - 8);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
