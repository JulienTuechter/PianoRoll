import { useCallback, useRef, useState } from 'react';
import { useCopy } from '../i18n';
import { useCanvasLoop, prefersReducedMotion } from '../hooks';
import { useKeyboardInput } from '../input';
import { sound, wakeSound } from '../audio';
import { glowCapsule, strikeLine } from '../stage';
import { ParticleSystem } from '../../../src/ui/canvas/particles';
import {
  defaultTimingWindows as W,
  gradeOffset,
  type TimingDirection,
  type TimingGrade,
} from '../../../src/core/scoring/scoring';
import { theme } from '../../../src/ui/theme';

const BPM = 100;
const BEAT = 60 / BPM;
const PATTERN = [0, 1, 2, 2.5, 3, 4, 5, 5.5, 6, 7, 8, 9, 9.5, 10, 10.5, 11, 12];
const PITCHES = [60, 64, 67, 72, 67, 62, 65, 69, 74, 69, 64, 67, 71, 76, 74, 71, 72];
const COUNT_IN = 4;
const FALL_SEC = 1.6;

interface Target {
  t: number;
  midi: number;
  grade: TimingGrade | null;
  offset: number;
}

interface Hit {
  offset: number;
  grade: TimingGrade;
  direction: TimingDirection;
}

function markMiss(t: Target): void {
  t.grade = 'miss';
  t.offset = W.catchMs;
}

function grade(t: Target, g: TimingGrade, offset: number): void {
  t.grade = g;
  t.offset = offset;
}

const GRADE_COLOR: Record<TimingGrade, string> = {
  perfect: theme.correct,
  good: theme.timing,
  miss: theme.wrong,
};

/** Performance-Modus zum Anfassen: Timing-Bewertung mit den Fenstern und der Bewertungsfunktion der App. */
export function TimingDemo() {
  const c = useCopy();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const run = useRef({
    startMs: 0,
    running: false,
    targets: [] as Target[],
    clicks: 0,
    pops: [] as { text: string; color: string; born: number; x: number }[],
    particles: new ParticleSystem(500),
    flash: 0,
    w: 0,
    h: 0,
  });
  const [hits, setHits] = useState<Hit[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const still = prefersReducedMotion();

  const start = () => {
    wakeSound();
    const r = run.current;
    r.startMs = performance.now() + 300;
    r.running = true;
    r.clicks = 0;
    r.pops = [];
    r.targets = PATTERN.map((b, i) => ({
      t: (COUNT_IN + b) * BEAT,
      midi: PITCHES[i % PITCHES.length]!,
      grade: null,
      offset: 0,
    }));
    setHits([]);
    setState('running');
  };

  const judge = useCallback(
    (velocity = 0.75) => {
      const r = run.current;
      if (!r.running) return;
      const now = (performance.now() - r.startMs) / 1000;
      let best: Target | null = null;
      for (const t of r.targets) {
        if (t.grade) continue;
        if (Math.abs(now - t.t) * 1000 > W.catchMs) continue;
        if (!best || Math.abs(now - t.t) < Math.abs(now - best.t)) best = t;
      }
      if (!best) return;
      const offset = (now - best.t) * 1000;
      const g = gradeOffset(offset, W);
      grade(best, g.grade, offset);
      sound.play(best.midi, velocity, 0.5);
      const label =
        g.grade === 'perfect'
          ? c.perf.perfect
          : `${g.grade === 'good' ? c.perf.good : c.perf.miss} · ${g.direction === 'early' ? c.perf.early : c.perf.late}`;
      r.pops.push({ text: label, color: GRADE_COLOR[g.grade], born: performance.now(), x: 0 });
      if (g.grade !== 'miss' && !still)
        r.particles.burst(
          r.w / 2,
          r.h - 28,
          g.grade === 'perfect' ? '#6fc884' : '#f7b83d',
          g.grade === 'perfect' ? 40 : 22,
        );
      if (g.grade === 'miss') r.flash = 1;
      setHits((h) => [...h, { offset, grade: g.grade, direction: g.direction }]);
    },
    [c, still],
  );

  useKeyboardInput(sectionRef, {
    octave: 4,
    noteOn: (_m, v) => judge(v),
    noteOff: () => {},
    other: (code) => {
      if (code !== 'Space' && code !== 'Enter') return false;
      if (run.current.running) judge();
      return run.current.running;
    },
  });

  useCanvasLoop(canvasRef, (ctx, { w, h }, dt) => {
    const r = run.current;
    r.w = w;
    r.h = h;
    const hitY = h - 28;
    const laneW = Math.min(150, w * 0.32);
    const lx = (w - laneW) / 2;
    const now = r.running ? (performance.now() - r.startMs) / 1000 : 0;

    ctx.fillStyle = '#0b0605';
    ctx.fillRect(0, 0, w, h);
    // Bahn
    const lane = ctx.createLinearGradient(0, 0, 0, h);
    lane.addColorStop(0, 'rgba(254,106,0,0)');
    lane.addColorStop(1, 'rgba(254,106,0,0.10)');
    ctx.fillStyle = lane;
    ctx.fillRect(lx, 0, laneW, h);
    ctx.fillStyle = 'rgba(242,234,221,0.08)';
    ctx.fillRect(lx, 0, 1, h);
    ctx.fillRect(lx + laneW - 1, 0, 1, h);

    // Toleranzfenster an der Linie: Good (breiter) und Perfect
    const pxPerSec = (hitY - 10) / FALL_SEC;
    const good = (W.goodMs / 1000) * pxPerSec;
    const perf = (W.perfectMs / 1000) * pxPerSec;
    ctx.fillStyle = 'rgba(247,184,61,0.07)';
    ctx.fillRect(lx, hitY - good, laneW, good * 2);
    ctx.fillStyle = 'rgba(111,200,132,0.12)';
    ctx.fillRect(lx, hitY - perf, laneW, perf * 2);

    ctx.globalCompositeOperation = 'lighter';
    strikeLine(ctx, hitY, w, 0.9);

    if (r.running) {
      // Metronom im Einzähler und auf jedem Schlag
      const beat = Math.floor(now / BEAT);
      if (beat >= r.clicks && beat >= 0) {
        if (beat < COUNT_IN) sound.click(beat === 0);
        r.clicks = beat + 1;
      }
      let open = 0;
      for (const t of r.targets) {
        if (!t.grade && (now - t.t) * 1000 > W.catchMs) {
          markMiss(t);
          r.pops.push({ text: c.perf.miss, color: theme.wrong, born: performance.now(), x: 0 });
          r.flash = 1;
          setHits((hh) => [...hh, { offset: W.catchMs, grade: 'miss', direction: 'late' }]);
        }
        if (!t.grade) open++;
        const y = hitY - (t.t - now) * pxPerSec;
        if (y < -40 || y > h + 40) continue;
        if (t.grade && t.grade !== 'miss') continue;
        const nw = laneW * 0.62;
        glowCapsule(
          ctx,
          (w - nw) / 2,
          y - 22,
          nw,
          22,
          t.grade === 'miss' ? '#7f6e60' : '#fe6a00',
          t.grade ? 0.35 : 1,
        );
      }
      if (open === 0 && now > r.targets[r.targets.length - 1]!.t + 0.5) {
        r.running = false;
        setState('done');
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    if (r.flash > 0) {
      ctx.fillStyle = theme.wrong;
      ctx.globalAlpha = 0.18 * r.flash;
      ctx.fillRect(lx, 0, laneW, h);
      ctx.globalAlpha = 1;
      r.flash = Math.max(0, r.flash - dt * 3);
    }

    // Bewertungen steigen auf
    const pnow = performance.now();
    r.pops = r.pops.filter((p) => pnow - p.born < 900).slice(-3);
    ctx.textAlign = 'center';
    ctx.font = 'italic 600 24px "Fraunces Variable", Georgia, serif';
    // neueste Bewertung unten, ältere rücken nach oben
    r.pops.forEach((p, i) => {
      const k = (pnow - p.born) / 900;
      const stack = r.pops.length - 1 - i;
      ctx.globalAlpha = (1 - k) * (stack === 0 ? 1 : 0.5);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, w / 2, hitY - 90 - k * 40 - stack * 34);
    });
    ctx.globalAlpha = 1;

    r.particles.update(dt);
    r.particles.draw(ctx);
  });

  const counts = { perfect: 0, good: 0, miss: 0 };
  for (const h of hits) counts[h.grade]++;
  const range = W.catchMs;
  const pct = (ms: number) => 50 + (Math.max(-range, Math.min(range, ms)) / range) * 50;

  return (
    <section className="demo timing" id="timing" ref={sectionRef}>
      <div className="split">
        <div className="demo-head">
          <p className="kicker">{c.perf.kicker}</p>
          <h2>{c.perf.title}</h2>
          <p className="lead">{c.perf.lead}</p>
          <div className="grades">
            <span className="g perfect">
              <b>{counts.perfect}</b> {c.perf.perfect}
            </span>
            <span className="g good">
              <b>{counts.good}</b> {c.perf.good}
            </span>
            <span className="g miss">
              <b>{counts.miss}</b> {c.perf.miss}
            </span>
          </div>
          <div className="spread" aria-label={c.perf.spread}>
            <p>{c.perf.spread}</p>
            <div className="spread-track">
              <span
                className="zone good"
                style={{ left: `${pct(-W.goodMs)}%`, right: `${100 - pct(W.goodMs)}%` }}
              />
              <span
                className="zone perfect"
                style={{ left: `${pct(-W.perfectMs)}%`, right: `${100 - pct(W.perfectMs)}%` }}
              />
              <span className="zero" />
              {hits.map((h, i) => (
                <i key={i} className={h.grade} style={{ left: `${pct(h.offset)}%` }} />
              ))}
            </div>
            <div className="spread-scale">
              <span>
                −{range} ms · {c.perf.early}
              </span>
              <span>0</span>
              <span>
                {c.perf.late} · +{range} ms
              </span>
            </div>
          </div>
        </div>
        <div className="timing-stage">
          <canvas
            ref={canvasRef}
            className="timing-canvas"
            onPointerDown={() => (state === 'running' ? judge() : undefined)}
            role="img"
            aria-label={c.perf.lead}
          />
          {state !== 'running' && (
            <button type="button" className="cta timing-start" onClick={start}>
              {state === 'idle' ? c.perf.start : c.perf.again}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
