import { useRef, useState } from 'react';
import { useCopy } from '../i18n';
import { useCanvasLoop, scrollProgress, prefersReducedMotion } from '../hooks';
import { clamp01, demoSong, handColor, keyboardFrame, smoothstep, strikeLine } from '../stage';
import { sound } from '../audio';
import { computeKeyboardLayout, type KeyboardLayout } from '../../../src/ui/canvas/keyboard-layout';
import { drawFallingNotes, type FallingFrame } from '../../../src/ui/canvas/falling-notes-renderer';
import { drawKeyboard } from '../../../src/ui/canvas/keyboard-renderer';
import { ParticleSystem } from '../../../src/ui/canvas/particles';
import { firstNoteIndexAtOrAfter } from '../../../src/core/note-event-model/notes';
import type { Hand } from '../../../src/core/note-event-model/types';
import { rgba } from '../../../src/ui/theme';

const MIN = 36;
const MAX = 84;
const WINDOW = 3.2;

/**
 * Sticky-Szene „Von der Bühne bis zur Klaviatur“: Beim Scrollen kippt die Notenbahn aus der Tiefe der Bühne
 * nach vorn, das Demo-Stück läuft scroll-gesteuert ab (mit den Renderern der App), Noten landen auf den
 * Tasten und sprühen Funken. Mit Ton spielt das Scrollen die Demo.
 */
export function Descent() {
  const c = useCopy();
  const sectionRef = useRef<HTMLElement>(null);
  const rigRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const st = useRef({
    pos: -WINDOW * 0.45,
    layout: null as KeyboardLayout | null,
    lw: 0,
    particles: new ParticleSystem(900),
    step: 0,
  });
  const still = prefersReducedMotion();

  useCanvasLoop(canvasRef, (ctx, { w, h }, dt, now) => {
    const section = sectionRef.current;
    if (!section) return;
    const s = st.current;
    const demo = demoSong();
    const p = scrollProgress(section);

    // Kamerafahrt: Bahn liegt zuerst flach in der Bühnentiefe und kippt dann nach vorn
    const tilt = smoothstep(0, 0.32, p);
    const rig = rigRef.current;
    if (rig) {
      rig.style.setProperty('--tilt', (1 - tilt).toFixed(4));
      rig.style.setProperty('--lift', smoothstep(0.75, 1, p).toFixed(4));
    }

    const nextStep = Math.min(3, Math.floor(clamp01((p - 0.02) / 0.9) * 4));
    if (nextStep !== s.step) {
      s.step = nextStep;
      setStep(nextStep);
    }

    // Songposition folgt dem Scrollen mit etwas Trägheit
    const songEnd = demo.song.durationSec + 0.4;
    const target = -WINDOW * 0.45 + clamp01((p - 0.06) / 0.86) * (songEnd + WINDOW * 0.45);
    const prev = s.pos;
    s.pos = still ? target : s.pos + (target - s.pos) * (1 - Math.pow(0.0025, dt));
    const pos = s.pos;

    if (s.lw !== w || !s.layout) {
      s.layout = computeKeyboardLayout(w, MIN, MAX);
      s.lw = w;
    }
    const layout = s.layout;
    const kh = Math.round(Math.min(150, Math.max(80, w * 0.13)));
    const nh = h - kh;

    // Angeschlagene Noten (nur vorwärts, nicht bei großen Sprüngen)
    const forward = pos - prev;
    if (forward > 0 && forward < 0.6) {
      for (let i = firstNoteIndexAtOrAfter(demo.notes, prev); i < demo.notes.length; i++) {
        const n = demo.notes[i]!;
        if (n.startSec > pos) break;
        if (n.startSec <= prev) continue;
        const k = layout.byMidi[n.midi];
        if (k && !still)
          s.particles.burst(k.x + k.w / 2, nh, handColor(n.hand), 10 + Math.round(n.velocity * 26));
        sound.play(n.midi, n.velocity * 0.85, Math.min(1.4, n.durationSec));
      }
    }

    const active = new Map<number, Hand>();
    for (let i = firstNoteIndexAtOrAfter(demo.notes, pos - demo.maxDurationSec); i < demo.notes.length; i++) {
      const n = demo.notes[i]!;
      if (n.startSec > pos) break;
      if (n.startSec + n.durationSec > pos) {
        active.set(n.midi, n.hand);
        const k = layout.byMidi[n.midi];
        if (k && !still && Math.random() < 0.5)
          s.particles.sparkle(k.x + k.w / 2, nh, k.w * 0.6, handColor(n.hand), 1);
      }
    }

    const frame: FallingFrame = {
      positionSec: pos,
      windowSec: WINDOW,
      notes: demo.notes,
      maxDurationSec: demo.maxDurationSec,
      measures: demo.measures,
      showNoteNames: p > 0.3,
      practiced: null,
      currentIds: null,
      waiting: false,
      hideBeforeSec: null,
      loop: null,
      beginner: p > 0.48,
      still,
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, nh);
    ctx.clip();
    drawFallingNotes(ctx, layout, nh, frame);

    // Bloom: weicher Schein um sichtbare Noten
    ctx.globalCompositeOperation = 'lighter';
    const pxPerSec = nh / WINDOW;
    for (let i = firstNoteIndexAtOrAfter(demo.notes, pos - demo.maxDurationSec); i < demo.notes.length; i++) {
      const n = demo.notes[i]!;
      if (n.startSec > pos + WINDOW) break;
      const end = n.startSec + n.durationSec;
      if (end < pos) continue;
      const k = layout.byMidi[n.midi];
      if (!k) continue;
      const yb = nh - (n.startSec - pos) * pxPerSec;
      const yt = nh - (end - pos) * pxPerSec;
      const col = handColor(n.hand);
      const pad = k.w * 0.7;
      const g = ctx.createLinearGradient(k.x - pad, 0, k.x + k.w + pad, 0);
      g.addColorStop(0, rgba(col, 0));
      g.addColorStop(0.5, rgba(col, n.startSec <= pos ? 0.45 : 0.22));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(k.x - pad, yt - pad * 0.5, k.w + pad * 2, yb - yt + pad);
    }
    strikeLine(ctx, nh, w, 0.7 + 0.3 * (active.size > 0 ? 1 : 0));
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    ctx.save();
    ctx.translate(0, nh);
    drawKeyboard(ctx, layout, kh, keyboardFrame(now, { active }));
    ctx.restore();

    s.particles.update(dt);
    s.particles.draw(ctx);
  });

  return (
    <section className="descent" id="descent" ref={sectionRef} aria-label={c.descent.label}>
      <div className="descent-sticky">
        <div className="descent-light" aria-hidden="true" />
        <p className="descent-label">{c.descent.label}</p>
        <div className="descent-rig" ref={rigRef}>
          <canvas
            ref={canvasRef}
            className="descent-canvas"
            role="img"
            aria-label={c.descent.steps.map((s) => s.t).join(' ')}
          />
        </div>
        <ol className="descent-steps">
          {c.descent.steps.map((s, i) => (
            <li key={s.k} className={i === step ? 'on' : i < step ? 'past' : ''}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <strong>{s.k}</strong>
              <p>{s.t}</p>
            </li>
          ))}
        </ol>
        <p className="descent-hint" aria-hidden="true">
          {c.descent.hint}
        </p>
      </div>
    </section>
  );
}
