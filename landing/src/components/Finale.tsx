import { useCallback, useEffect, useRef } from 'react';
import { useCopy, useLang } from '../i18n';
import { appPath } from '../../../src/i18n/routes';
import { useCanvasLoop, prefersReducedMotion } from '../hooks';
import { useKeyboardInput } from '../input';
import { sound, wakeSound } from '../audio';
import { keyboardFrame } from '../stage';
import { Keys } from './Keys';
import { computeKeyboardLayout, type KeyboardLayout } from '../../../src/ui/canvas/keyboard-layout';
import { ParticleSystem } from '../../../src/ui/canvas/particles';
import { labelForMidi } from '../../../src/core/input/keyboard-map';
import { handColors, rgba } from '../../../src/ui/theme';
import { PIANO_MAX_MIDI, PIANO_MIN_MIDI } from '../../../src/core/note-event-model/types';

interface Rise {
  midi: number;
  start: number;
  end: number | null;
  velocity: number;
}

/** Gehaltene Lichtsäulen einer Taste beim Loslassen beenden */
function endRises(rises: Rise[], midi: number): void {
  for (const r of rises) if (r.midi === midi && r.end === null) r.end = performance.now();
}

/**
 * Finale: alle 88 Tasten, spielbar. Wie im freien Spiel der App steigen gespielte Noten als Lichtsäulen auf.
 */
export function Finale() {
  const c = useCopy();
  const lang = useLang();
  const sectionRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const st = useRef({
    pressed: new Map<number, number>(),
    rises: [] as Rise[],
    particles: new ParticleSystem(900),
    layout: null as KeyboardLayout | null,
    lw: 0,
    h: 0,
  });
  const still = prefersReducedMotion();
  const colorOf = (m: number) => (m < 60 ? handColors.left : handColors.right);

  const down = useCallback(
    (midi: number, velocity: number) => {
      wakeSound();
      const s = st.current;
      s.pressed.set(midi, velocity);
      sound.on(midi, velocity);
      s.rises.push({ midi, start: performance.now(), end: null, velocity });
      const k = s.layout?.byMidi[midi];
      if (k && !still) s.particles.burst(k.x + k.w / 2, s.h, colorOf(midi), Math.round(12 + velocity * 30));
    },
    [still],
  );
  const up = useCallback((midi: number) => {
    const s = st.current;
    s.pressed.delete(midi);
    sound.off(midi);
    endRises(s.rises, midi);
  }, []);

  useKeyboardInput(sectionRef, { octave: 4, noteOn: down, noteOff: up });

  // Schmale Bildschirme: Klaviatur scrollt seitlich, Start beim mittleren C
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) * 0.5;
  }, []);

  useCanvasLoop(skyRef, (ctx, { w, h }, dt, now) => {
    const s = st.current;
    s.h = h;
    if (s.lw !== w || !s.layout) {
      s.layout = computeKeyboardLayout(w, PIANO_MIN_MIDI, PIANO_MAX_MIDI);
      s.lw = w;
    }
    ctx.clearRect(0, 0, w, h);
    const speed = h / 2.6; // px pro Sekunde
    ctx.globalCompositeOperation = 'lighter';
    s.rises = s.rises.filter((r) => r.end === null || h - ((now - r.end) / 1000) * speed > -20);
    for (const r of s.rises) {
      const k = s.layout.byMidi[r.midi];
      if (!k) continue;
      const top = h - ((now - r.start) / 1000) * speed;
      const bottom = r.end === null ? h : h - ((now - r.end) / 1000) * speed;
      const col = colorOf(r.midi);
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0, rgba(col, 0.15));
      g.addColorStop(1, rgba(col, 0.55 + 0.4 * r.velocity));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(k.x + 1, Math.max(-10, top), k.w - 2, Math.max(3, bottom - Math.max(-10, top)), 3);
      ctx.fill();
      const halo = ctx.createLinearGradient(k.x - k.w * 0.6, 0, k.x + k.w * 1.6, 0);
      halo.addColorStop(0, rgba(col, 0));
      halo.addColorStop(0.5, rgba(col, 0.16));
      halo.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(k.x - k.w * 0.6, Math.max(-10, top), k.w * 2.2, Math.max(3, bottom - Math.max(-10, top)));
    }
    if (!still)
      for (const [m] of s.pressed) {
        const k = s.layout.byMidi[m];
        if (k) s.particles.sparkle(k.x + k.w / 2, h, k.w, colorOf(m), 1);
      }
    ctx.globalCompositeOperation = 'source-over';
    s.particles.update(dt);
    s.particles.draw(ctx);
  });

  const frame = useCallback(
    (now: number) => {
      const labels = new Map<number, string>();
      for (let m = 60; m <= 88; m++) {
        const l = labelForMidi(m, 4, lang);
        if (l) labels.set(m, l);
      }
      const active = new Map<number, 'left' | 'right'>();
      for (const m of st.current.pressed.keys()) active.set(m, m < 60 ? 'left' : 'right');
      return keyboardFrame(now, { active, labels });
    },
    [lang],
  );

  return (
    <section className="finale" id="play" ref={sectionRef}>
      <div className="finale-copy">
        <h2>{c.finale.title}</h2>
        <p className="lead">{c.finale.lead}</p>
        <a className="cta big" href={appPath(lang)}>
          {c.finale.cta}
          <span aria-hidden="true">→</span>
        </a>
        <p className="note">{c.finale.note}</p>
      </div>
      <div className="finale-piano" ref={scrollerRef}>
        <div className="finale-piano-inner">
          <canvas ref={skyRef} className="finale-sky" aria-hidden="true" />
          <Keys
            min={PIANO_MIN_MIDI}
            max={PIANO_MAX_MIDI}
            frame={frame}
            onDown={down}
            onUp={up}
            className="finale-keys"
            label={c.finale.lead}
          />
        </div>
      </div>
    </section>
  );
}
