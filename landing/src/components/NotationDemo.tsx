import { useEffect, useMemo, useRef, useState } from 'react';
import { useCopy } from '../i18n';
import { useCanvasLoop, useNear, prefersReducedMotion } from '../hooks';
import { sound, wakeSound } from '../audio';
import { demoSong, handColor, keyboardFrame, strikeLine } from '../stage';
import { scoreFor } from '../../../src/ui/notation/score-for-song';
import { cursorAt, renderScore, type ScoreLayout } from '../../../src/ui/notation/render-score';
import { computeKeyboardLayout, type KeyboardLayout } from '../../../src/ui/canvas/keyboard-layout';
import { drawFallingNotes } from '../../../src/ui/canvas/falling-notes-renderer';
import { drawKeyboard } from '../../../src/ui/canvas/keyboard-renderer';
import { firstNoteIndexAtOrAfter } from '../../../src/core/note-event-model/notes';
import { measureIndexAt } from '../../../src/core/note-event-model/tempo-map';
import type { Hand } from '../../../src/core/note-event-model/types';
import { ParticleSystem } from '../../../src/ui/canvas/particles';

const MIN = 36;
const MAX = 84;
/**
 * Das Notenblatt wird in fester Breite gesetzt (vier Takte pro Zeile) und dann auf die verfügbare Breite skaliert –
 * auf dem Handy kompakt, auf großen Bildschirmen etwas größer.
 */
const SCORE_W = 820;
const MAX_SCALE = 1.3;

/**
 * Notenschrift: dasselbe Demo-Stück, gesetzt mit dem VexFlow-Renderer der App (erst in Sichtweite nachgeladen),
 * darüber fallende Noten mit Klaviatur im Gleichlauf – wie die geteilte Ansicht der App.
 */
export function NotationDemo() {
  const c = useCopy();
  const sectionRef = useRef<HTMLElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLCanvasElement>(null);
  const near = useNear(sectionRef, '600px');
  const [layout, setLayout] = useState<ScoreLayout | null>(null);
  const [avail, setAvail] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState(1);
  const play = useRef({ pos: 0, playing: false, lastNow: 0, bar: 1 });
  const strip = useRef({ layout: null as KeyboardLayout | null, lw: 0, particles: new ParticleSystem(400) });
  const still = prefersReducedMotion();

  const scoreW = SCORE_W;
  const scale = avail > 0 ? Math.min(MAX_SCALE, avail / scoreW) : 1;
  const bars = demoSong().measures.length;

  const score = useMemo(() => {
    if (!near) return null;
    const d = demoSong();
    return scoreFor(d.notes, d.measures, d.song.ppq, { tonicPc: 0, mode: 'major' }, d.tempoMap);
  }, [near]);

  // verfügbare Breite des Notenblatts beobachten
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    let t = 0;
    const measure = () => setAvail(Math.floor(el.clientWidth - 24));
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(measure, 150);
    });
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !score) return;
    let cancelled = false;
    renderScore(el, score, scoreW)
      .then((l) => !cancelled && setLayout(l))
      .catch((e: unknown) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [score, scoreW]);

  // Leichtes Kippen des Notenblatts zur Maus
  useEffect(() => {
    const paper = paperRef.current;
    if (!paper || still) return;
    const onMove = (e: PointerEvent) => {
      const r = paper.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      paper.style.setProperty('--rx', `${(-y * 2.5).toFixed(2)}deg`);
      paper.style.setProperty('--ry', `${(x * 3).toFixed(2)}deg`);
      paper.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`);
      paper.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`);
    };
    const reset = () => {
      paper.style.setProperty('--rx', '0deg');
      paper.style.setProperty('--ry', '0deg');
    };
    paper.addEventListener('pointermove', onMove);
    paper.addEventListener('pointerleave', reset);
    return () => {
      paper.removeEventListener('pointermove', onMove);
      paper.removeEventListener('pointerleave', reset);
    };
  }, [still]);

  const toggle = () => {
    wakeSound();
    const p = play.current;
    const d = demoSong();
    if (!p.playing && p.pos >= d.song.durationSec) p.pos = 0;
    p.playing = !p.playing;
    p.lastNow = performance.now();
    if (!p.playing) sound.stopAll();
    setPlaying(p.playing);
  };

  // Ein Takt für Zeit, Klang, fallende Noten, Klaviatur, Cursor und leuchtende Noten
  useCanvasLoop(stripRef, (ctx, { w, h }, _dt, now) => {
    const p = play.current;
    const d = demoSong();
    const s = strip.current;
    const dt = Math.min(0.05, (now - p.lastNow) / 1000);
    p.lastNow = now;
    const kh = Math.round(Math.min(56, Math.max(34, w * 0.05)));
    const nh = h - kh;
    if (p.playing) {
      const prev = p.pos;
      p.pos += dt;
      for (let i = firstNoteIndexAtOrAfter(d.notes, prev + 1e-6); i < d.notes.length; i++) {
        const n = d.notes[i]!;
        if (n.startSec > p.pos) break;
        sound.play(n.midi, n.velocity * 0.85, n.durationSec);
        const k = s.layout?.byMidi[n.midi];
        if (k && !still) s.particles.burst(k.x + k.w / 2, nh, handColor(n.hand), 14);
      }
      if (p.pos > d.song.durationSec + 0.3) {
        p.playing = false;
        setPlaying(false);
      }
    }
    const curBar = Math.min(bars, measureIndexAt(d.measures, p.pos) + 1);
    if (curBar !== p.bar) {
      p.bar = curBar;
      setBar(curBar);
    }
    if (s.lw !== w || !s.layout) {
      s.layout = computeKeyboardLayout(w, MIN, MAX);
      s.lw = w;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, nh);
    ctx.clip();
    drawFallingNotes(ctx, s.layout, nh, {
      positionSec: p.pos,
      windowSec: 2.4,
      notes: d.notes,
      maxDurationSec: d.maxDurationSec,
      measures: d.measures,
      showNoteNames: false,
      practiced: null,
      currentIds: null,
      waiting: false,
      hideBeforeSec: null,
      loop: null,
      beginner: false,
      still,
    });
    ctx.globalCompositeOperation = 'lighter';
    strikeLine(ctx, nh, w, 0.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    const active = new Map<number, Hand>();
    for (let i = firstNoteIndexAtOrAfter(d.notes, p.pos - d.maxDurationSec); i < d.notes.length; i++) {
      const n = d.notes[i]!;
      if (n.startSec > p.pos) break;
      if (n.startSec + n.durationSec > p.pos) active.set(n.midi, n.hand);
    }
    ctx.save();
    ctx.translate(0, nh);
    drawKeyboard(ctx, s.layout, kh, keyboardFrame(now, { active }));
    ctx.restore();
    s.particles.update(dt);
    s.particles.draw(ctx);

    if (!layout) return;
    const tick = d.tempoMap.secToTick(Math.max(0, p.pos));
    const cpos = cursorAt(layout.points, tick);
    const row = cpos ? layout.rows[cpos.row] : undefined;
    const cur = cursorRef.current;
    if (cur && cpos && row) {
      cur.style.display = 'block';
      cur.style.transform = `translate(${cpos.x}px, ${row.y + 18}px)`;
      cur.style.height = `${row.h - 40}px`;
    }
    const lit = new Set<SVGElement>();
    for (let i = firstNoteIndexAtOrAfter(d.notes, p.pos - d.maxDurationSec); i < d.notes.length; i++) {
      const n = d.notes[i]!;
      if (n.startSec > p.pos) break;
      if (n.startSec + n.durationSec > p.pos) for (const el of layout.noteEls.get(n.id) ?? []) lit.add(el);
    }
    for (const els of layout.noteEls.values())
      for (const el of els) el.classList.toggle('vf-playing', lit.has(el));
  });

  return (
    <section className="demo notation" id="notation" ref={sectionRef}>
      <div className="demo-head">
        <p className="kicker">{c.notation.kicker}</p>
        <h2>{c.notation.title}</h2>
        <p className="lead">{c.notation.lead}</p>
      </div>
      <div className="demo-stage notation-stage">
        <div className="demo-bar">
          <button type="button" className="play-btn" onClick={toggle} aria-pressed={playing}>
            <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
            {playing ? c.notation.pause : c.notation.play}
          </button>
          <span className={`pill ${playing ? 'on' : ''}`}>{c.notation.bar(bar, bars)}</span>
        </div>
        <canvas ref={stripRef} className="notation-strip" aria-hidden="true" />
        <div className="paper" ref={paperRef}>
          <div
            className="paper-fit"
            style={{ height: layout ? Math.ceil(layout.height * scale) : undefined }}
          >
            <div
              className="paper-scale"
              style={{
                width: scoreW,
                marginLeft: Math.max(0, (avail - scoreW * scale) / 2),
                transform: `scale(${scale})`,
              }}
            >
              <div ref={svgRef} className="paper-svg" />
              <div ref={cursorRef} className="paper-cursor" />
            </div>
            {!layout && <p className="paper-loading">{c.notation.loading}</p>}
          </div>
          <div className="paper-light" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
