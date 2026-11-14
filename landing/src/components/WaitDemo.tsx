import { useCallback, useRef, useState } from 'react';
import { useCopy, useLang } from '../i18n';
import { useCanvasLoop, useVisible, prefersReducedMotion } from '../hooks';
import { useKeyboardInput } from '../input';
import { sound, wakeSound } from '../audio';
import { demoSong, handColor, keyboardFrame, strikeLine } from '../stage';
import { Keys } from './Keys';
import { computeKeyboardLayout, type KeyboardLayout } from '../../../src/ui/canvas/keyboard-layout';
import { drawFallingNotes } from '../../../src/ui/canvas/falling-notes-renderer';
import type { KeyFlash } from '../../../src/ui/canvas/keyboard-renderer';
import { ParticleSystem } from '../../../src/ui/canvas/particles';
import { firstNoteIndexAtOrAfter, groupByOnset } from '../../../src/core/note-event-model/notes';
import { labelForMidi } from '../../../src/core/input/keyboard-map';
import type { KeyJudgement } from '../../../src/core/practice-engine/engine-types';
import type { Hand, NoteEvent } from '../../../src/core/note-event-model/types';
import { theme } from '../../../src/ui/theme';

const MIN = 48;
const MAX = 84;
const WINDOW = 2.6;
const LEAD_IN = -1.6;
/** Bis so weit vor dem Anschlag zählt eine Taste schon als richtig */
const EARLY_SEC = 0.35;

type Mode = 'wait' | 'watch';

interface Engine {
  mode: Mode;
  running: boolean;
  pos: number;
  groups: NoteEvent[][];
  gi: number;
  satisfied: Set<number>;
  waiting: boolean;
  hits: number;
  errors: number;
  done: boolean;
  pressed: Map<number, number>;
  judgements: Map<number, KeyJudgement>;
  flashes: Map<number, KeyFlash>;
  /** Rotes Flackern bei falscher Taste */
  shake: number;
}

function newEngine(mode: Mode): Engine {
  const right = demoSong().notes.filter((n) => n.hand === 'right');
  return {
    mode,
    running: true,
    pos: LEAD_IN,
    groups: groupByOnset(right),
    gi: 0,
    satisfied: new Set(),
    waiting: false,
    hits: 0,
    errors: 0,
    done: false,
    pressed: new Map(),
    judgements: new Map(),
    flashes: new Map(),
    shake: 0,
  };
}

/**
 * Warte-Modus zum Anfassen: das Demo-Stück der App, die Zeit hält vor jeder Note der rechten Hand an,
 * bis sie gespielt wird; die linke Hand begleitet. Gleiche Renderer, Markierungen und Simulator-Belegung wie in der App.
 */
export function WaitDemo() {
  const c = useCopy();
  const lang = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const notesRef = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(sectionRef, '-20% 0px');
  const eng = useRef<Engine>(newEngine('wait'));
  const fx = useRef({
    particles: new ParticleSystem(700),
    layout: null as KeyboardLayout | null,
    lw: 0,
    nh: 0,
  });
  const [ui, setUi] = useState({ hits: 0, errors: 0, waiting: false, done: false, mode: 'wait' as Mode });
  const still = prefersReducedMotion();

  const sync = useCallback(() => {
    const e = eng.current;
    setUi((u) =>
      u.hits === e.hits &&
      u.errors === e.errors &&
      u.waiting === e.waiting &&
      u.done === e.done &&
      u.mode === e.mode
        ? u
        : { hits: e.hits, errors: e.errors, waiting: e.waiting, done: e.done, mode: e.mode },
    );
  }, []);

  const burstAt = useCallback(
    (midi: number, hand: Hand, strength: number) => {
      const f = fx.current;
      const k = f.layout?.byMidi[midi];
      if (k && !still)
        f.particles.burst(k.x + k.w / 2, f.nh, handColor(hand), Math.round(14 + 26 * strength));
    },
    [still],
  );

  const advance = (e: Engine) => {
    e.gi++;
    e.satisfied.clear();
    e.waiting = false;
  };

  const noteOn = useCallback(
    (midi: number, velocity: number) => {
      wakeSound();
      const e = eng.current;
      e.pressed.set(midi, velocity);
      sound.on(midi, velocity);
      const group = e.groups[e.gi];
      if (e.mode !== 'wait' || e.done || !group) return;
      const target = group[0]!.startSec;
      const inGroup = group.some((n) => n.midi === midi);
      const near = e.waiting || target - e.pos <= EARLY_SEC;
      if (inGroup && near && !e.satisfied.has(midi)) {
        e.satisfied.add(midi);
        e.judgements.set(midi, 'correct');
        burstAt(midi, 'right', velocity);
        if (group.every((n) => e.satisfied.has(n.midi))) {
          e.hits++;
          e.pos = Math.max(e.pos, target);
          advance(e);
        }
      } else if (!inGroup || !near) {
        e.judgements.set(midi, 'wrong');
        e.errors++;
        e.shake = 1;
      }
      sync();
    },
    [sync, burstAt],
  );

  const noteOff = useCallback((midi: number) => {
    const e = eng.current;
    e.pressed.delete(midi);
    sound.off(midi);
    const j = e.judgements.get(midi);
    if (j) e.flashes.set(midi, { kind: j, untilMs: performance.now() + 280 });
    e.judgements.delete(midi);
  }, []);

  useKeyboardInput(sectionRef, { octave: 4, noteOn, noteOff });

  const restart = (mode: Mode) => {
    sound.stopAll();
    eng.current = newEngine(mode);
    sync();
  };

  useCanvasLoop(notesRef, (ctx, { w, h }, dt, now) => {
    const e = eng.current;
    const f = fx.current;
    const demo = demoSong();
    if (f.lw !== w || !f.layout) {
      f.layout = computeKeyboardLayout(w, MIN, MAX);
      f.lw = w;
    }
    f.nh = h;
    const layout = f.layout;

    // Zeit läuft – im Warte-Modus nur bis zur nächsten Note der rechten Hand
    if (e.running && visible.current && !e.done) {
      const prev = e.pos;
      let next = e.pos + dt;
      const group = e.groups[e.gi];
      if (e.mode === 'wait' && group) {
        const t = group[0]!.startSec;
        if (next >= t) {
          next = t;
          if (!e.waiting) {
            e.waiting = true;
            sync();
          }
        }
      }
      e.pos = next;
      // Anschläge zwischen prev und pos: Begleitung (und im Anschauen-Modus auch die rechte Hand)
      for (let i = firstNoteIndexAtOrAfter(demo.notes, prev + 1e-6); i < demo.notes.length; i++) {
        const n = demo.notes[i]!;
        if (n.startSec > e.pos + 1e-6) break;
        if (n.hand === 'left' || e.mode === 'watch') {
          sound.play(n.midi, n.velocity * (n.hand === 'left' ? 0.75 : 0.9), n.durationSec);
          if (e.mode === 'watch') burstAt(n.midi, n.hand, n.velocity);
        }
      }
      if (e.mode === 'watch') {
        while (e.groups[e.gi] && e.groups[e.gi]![0]!.startSec <= e.pos) e.gi++;
      }
      if (e.pos > demo.song.durationSec + 0.6 && e.gi >= e.groups.length) {
        e.done = true;
        e.waiting = false;
        sync();
      }
    }

    const group = e.mode === 'wait' && !e.done ? e.groups[e.gi] : undefined;
    const currentIds = group ? new Set(group.map((n) => n.id)) : null;
    drawFallingNotes(ctx, layout, h, {
      positionSec: e.pos,
      windowSec: WINDOW,
      notes: demo.notes,
      maxDurationSec: demo.maxDurationSec,
      measures: demo.measures,
      showNoteNames: true,
      practiced: e.mode === 'wait' ? 'right' : null,
      currentIds,
      waiting: e.waiting,
      hideBeforeSec: null,
      loop: null,
      beginner: true,
      still,
    });
    ctx.globalCompositeOperation = 'lighter';
    strikeLine(ctx, h, w, e.waiting ? 1 : 0.6);
    ctx.globalCompositeOperation = 'source-over';
    if (e.shake > 0) {
      ctx.fillStyle = theme.wrong;
      ctx.globalAlpha = 0.22 * e.shake;
      ctx.fillRect(0, h - 40, w, 40);
      ctx.globalAlpha = 1;
      e.shake = Math.max(0, e.shake - dt * 4);
    }
    // sprühen, solange eine Note klingt
    if (!still) {
      for (const [m] of e.pressed) {
        const k = layout.byMidi[m];
        if (k && e.judgements.get(m) === 'correct')
          f.particles.sparkle(k.x + k.w / 2, h, k.w * 0.6, handColor('right'), 1);
      }
    }
    f.particles.update(dt);
    f.particles.draw(ctx);
    void now;
  });

  const keyFrame = (now: number) => {
    const e = eng.current;
    const demo = demoSong();
    const group = e.mode === 'wait' && !e.done ? e.groups[e.gi] : undefined;
    const active = new Map<number, Hand>();
    for (
      let i = firstNoteIndexAtOrAfter(demo.notes, e.pos - demo.maxDurationSec);
      i < demo.notes.length;
      i++
    ) {
      const n = demo.notes[i]!;
      if (n.startSec > e.pos) break;
      if (n.startSec + n.durationSec > e.pos && (n.hand === 'left' || e.mode === 'watch'))
        active.set(n.midi, n.hand);
    }
    const labels = new Map<number, string>();
    for (let m = MIN; m <= MAX; m++) {
      const l = labelForMidi(m, 4, lang);
      if (l) labels.set(m, l);
    }
    return keyboardFrame(now, {
      pressed: e.pressed,
      active,
      labels,
      expected:
        group && (e.waiting || group[0]!.startSec - e.pos < 1.2)
          ? new Map(group.map((n) => [n.midi, n.hand]))
          : null,
      satisfied: e.satisfied,
      judgements: e.judgements,
      flashes: e.flashes,
      hint: e.waiting,
      still,
    });
  };

  const total = ui.hits + ui.errors;
  const acc = total > 0 ? Math.round((ui.hits / total) * 100) : 100;

  return (
    <section className="demo" id="wait" ref={sectionRef}>
      <div className="demo-head">
        <p className="kicker">{c.wait.kicker}</p>
        <h2>{c.wait.title}</h2>
        <p className="lead">{c.wait.lead}</p>
      </div>
      <div className={`demo-stage wait-stage ${ui.waiting ? 'is-waiting' : ''}`}>
        <div className="demo-bar">
          <div className="seg" role="group">
            <button type="button" aria-pressed={ui.mode === 'wait'} onClick={() => restart('wait')}>
              {c.wait.play}
            </button>
            <button type="button" aria-pressed={ui.mode === 'watch'} onClick={() => restart('watch')}>
              {c.wait.watch}
            </button>
          </div>
          <div className="stats" aria-live="polite">
            {ui.mode === 'wait' && (
              <>
                <span className="stat">
                  <b>{ui.hits}</b> {c.wait.hits}
                </span>
                <span className="stat bad">
                  <b>{ui.errors}</b> {c.wait.errors}
                </span>
              </>
            )}
            <span className={`pill ${ui.waiting ? 'on' : ''}`}>{c.wait.waiting}</span>
          </div>
        </div>
        <div className="demo-screen">
          <canvas ref={notesRef} className="notes-canvas" aria-hidden="true" />
          {ui.done && (
            <div className="done">
              <p>{ui.mode === 'wait' ? c.wait.done(acc) : '♪'}</p>
              <button type="button" className="cta small" onClick={() => restart(ui.mode)}>
                {c.wait.restart}
              </button>
            </div>
          )}
        </div>
        <Keys min={MIN} max={MAX} frame={keyFrame} onDown={noteOn} onUp={noteOff} label={c.wait.keysHint} />
        <p className="demo-foot">{c.wait.keysHint}</p>
      </div>
    </section>
  );
}
