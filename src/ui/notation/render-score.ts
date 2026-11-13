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

function minMeasureWidth(m: NotationScore['measures'][number], firstInRow: boolean): number {
  const events = Math.max(m.treble.length, m.bass.length);
  const accidentals = [...m.treble, ...m.bass].some((e) => e.keys.some((k) => /^[a-g](#|b)/.test(k)))
    ? 12
    : 0;
  return 50 + 30 * events + accidentals + (firstInRow ? 100 : 0) + (m.timeSigChange ? 30 : 0);
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
  const staffNotes: Record<'treble' | 'bass', Placed[]> = { treble: [], bass: [] };

  rowsIdx.forEach((row, r) => {
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
        bs.addClef('bass').addKeySignature(score.keySpec);
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

      const make = (e: NotationEvent, clef: 'treble' | 'bass') => {
        const note = new StaveNote({
          keys: e.rest ? [clef === 'treble' ? 'b/4' : 'd/3'] : e.keys,
          duration: e.value,
          dots: e.dots,
          type: e.rest ? 'r' : undefined,
          clef,
          autoStem: true,
        });
        if (e.dots > 0) Dot.buildAndAttach([note], { all: true });
        return note;
      };
      const tNotes = m.treble.map((e) => make(e, 'treble'));
      const bNotes = m.bass.map((e) => make(e, 'bass'));
      const tv = new Voice({ numBeats: m.numerator, beatValue: m.denominator })
        .setMode(Voice.Mode.SOFT)
        .addTickables(tNotes);
      const bv = new Voice({ numBeats: m.numerator, beatValue: m.denominator })
        .setMode(Voice.Mode.SOFT)
        .addTickables(bNotes);
      Accidental.applyAccidentals([tv], score.keySpec);
      Accidental.applyAccidentals([bv], score.keySpec);
      new Formatter()
        .joinVoices([tv])
        .joinVoices([bv])
        .format([tv, bv], Math.max(20, ts.getNoteEndX() - startX - 12));
      const beams = [
        ...Beam.generateBeams(tNotes.filter((_, i) => !m.treble[i]!.rest)),
        ...Beam.generateBeams(bNotes.filter((_, i) => !m.bass[i]!.rest)),
      ];
      tv.draw(ctx, ts);
      bv.draw(ctx, bs);
      for (const b of beams) b.setContext(ctx).draw();

      const collect = (
        events: NotationEvent[],
        notes: InstanceType<typeof StaveNote>[],
        staff: 'treble' | 'bass',
      ) => {
        events.forEach((e, i) => {
          const note = notes[i]!;
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
      };
      collect(m.treble, tNotes, 'treble');
      collect(m.bass, bNotes, 'bass');
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

  // Haltebögen (zeilenübergreifend als zwei halbe Bögen)
  for (const staff of ['treble', 'bass'] as const) {
    const list = staffNotes[staff];
    list.forEach((p, i) => {
      if (!p.e.tieNext || p.e.rest) return;
      const next = list[i + 1];
      if (!next || next.e.rest) return;
      const first: number[] = [];
      const last: number[] = [];
      p.e.midis.forEach((m, fi) => {
        const li = next.e.midis.indexOf(m);
        if (li >= 0) {
          first.push(fi);
          last.push(li);
        }
      });
      if (first.length === 0) return;
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
    });
  }

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
