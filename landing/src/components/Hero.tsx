import { useEffect, useRef } from 'react';
import { useCopy } from '../i18n';
import { prefersReducedMotion, useCanvasLoop } from '../hooks';
import { glowCapsule } from '../stage';
import { handColors } from '../../../src/ui/theme';

/**
 * Bühne: Scheinwerferkegel, die dem Mauszeiger folgen, Staub im Licht und
 * drei Ebenen fallender Notenkapseln (Parallaxe bei Maus und Scrollen).
 */
interface Rain {
  x: number;
  y: number;
  len: number;
  w: number;
  speed: number;
  color: string;
  depth: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  tw: number;
}

const EMBER = '#fe6a00';
const WARM = '#ffd9a8';

function makeRain(w: number, h: number): Rain[] {
  const out: Rain[] = [];
  const layers = [
    { n: 34, depth: 0.25, wid: 4, speed: 38 },
    { n: 18, depth: 0.55, wid: 8, speed: 70 },
    { n: 8, depth: 1, wid: 16, speed: 120 },
  ];
  // Schmale Bildschirme: weniger Regen, damit der Text lesbar bleibt
  const density = Math.min(1, Math.max(0.35, w / 1300));
  for (const l of layers) {
    for (let i = 0; i < Math.round(l.n * density); i++) {
      const r = Math.random();
      out.push({
        x: Math.random() * w,
        y: Math.random() * h * 1.4 - h * 0.4,
        len: (40 + Math.random() * 160) * (0.5 + l.depth),
        w: l.wid * (0.8 + Math.random() * 0.4),
        speed: l.speed * (0.8 + Math.random() * 0.5),
        color: r < 0.45 ? handColors.right : r < 0.85 ? handColors.left : EMBER,
        depth: l.depth,
      });
    }
  }
  return out;
}

export function Hero() {
  const c = useCopy();
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const world = useRef<{ w: number; h: number; rain: Rain[]; motes: Mote[] } | null>(null);
  const still = prefersReducedMotion();

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mouse.current.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    // Text-Parallaxe über eine CSS-Variable (kein React-Render pro Frame)
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = sectionRef.current;
        if (!el) return;
        const p = Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight || 1)));
        el.style.setProperty('--hero-p', p.toFixed(4));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  useCanvasLoop(canvasRef, (ctx, { w, h }, dt, now) => {
    if (!world.current || world.current.w !== w || Math.abs(world.current.h - h) > 80) {
      world.current = {
        w,
        h,
        rain: makeRain(w, h),
        motes: Array.from({ length: Math.round((w * h) / 9000) }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 6,
          vy: -2 - Math.random() * 6,
          r: 0.4 + Math.random() * 1.4,
          tw: Math.random() * Math.PI * 2,
        })),
      };
    }
    const wd = world.current;
    const m = mouse.current;
    const ease = still ? 1 : 1 - Math.pow(0.04, dt);
    m.x += (m.tx - m.x) * ease;
    m.y += (m.ty - m.y) * ease;
    const t = still ? 0 : now / 1000;
    const scroll = window.scrollY;
    const fade = Math.max(0, 1 - scroll / (h * 0.9));

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#0b0605';
    ctx.fillRect(0, 0, w, h);

    // Bühnenboden: warmer Schein unten
    const floor = ctx.createRadialGradient(w / 2 + m.x * 30, h * 1.05, 0, w / 2, h * 1.05, w * 0.7);
    floor.addColorStop(0, 'rgba(254,106,0,0.22)');
    floor.addColorStop(0.5, 'rgba(120,40,10,0.08)');
    floor.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = floor;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';

    // Notenregen in drei Tiefen
    for (const r of wd.rain) {
      if (!still) r.y += r.speed * dt;
      if (r.y - r.len > h) {
        r.y = -r.len - Math.random() * h * 0.3;
        r.x = Math.random() * w;
      }
      const px = r.x + m.x * -40 * r.depth;
      const py = r.y - scroll * 0.6 * r.depth + m.y * -14 * r.depth;
      glowCapsule(ctx, px, py - r.len, r.w, r.len, r.color, (0.25 + 0.6 * r.depth) * fade, 0.6 + r.depth);
    }

    // Abdunkeln hinter dem Text, damit Titel und Einleitung lesbar bleiben
    ctx.globalCompositeOperation = 'source-over';
    const narrow = w < 700;
    const sx = narrow ? w * 0.5 : w * 0.3;
    const scrim = ctx.createRadialGradient(sx, h * 0.62, 0, sx, h * 0.62, Math.max(w * 0.42, 360));
    scrim.addColorStop(0, 'rgba(11,6,5,0.62)');
    scrim.addColorStop(1, 'rgba(11,6,5,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    // Scheinwerfer: drei Kegel, die langsam schwenken und dem Zeiger folgen
    const cones = [
      { ax: w * 0.18, sway: 0.7, phase: 0, tint: WARM, a: 0.11 },
      { ax: w * 0.5, sway: 0.4, phase: 2.1, tint: '#fff3e2', a: 0.14 },
      { ax: w * 0.82, sway: 0.6, phase: 4.2, tint: WARM, a: 0.11 },
    ];
    const axes: { ax: number; tx: number; ty: number; bw: number }[] = [];
    for (const cone of cones) {
      const tx =
        w * 0.5 +
        (cone.ax - w * 0.5) * 0.35 +
        Math.sin(t * 0.25 * cone.sway + cone.phase) * w * 0.08 +
        m.x * w * 0.12;
      const ty = h * 0.98;
      const bw = Math.max(110, w * 0.13);
      axes.push({ ax: cone.ax, tx, ty, bw });
      const grad = ctx.createLinearGradient(cone.ax, -40, tx, ty);
      grad.addColorStop(0, `rgba(255,236,210,${cone.a * 1.6 * fade})`);
      grad.addColorStop(0.6, `rgba(255,200,150,${cone.a * 0.6 * fade})`);
      grad.addColorStop(1, `rgba(255,160,90,${cone.a * 0.25 * fade})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cone.ax - 6, -40);
      ctx.lineTo(cone.ax + 6, -40);
      ctx.lineTo(tx + bw, ty);
      ctx.ellipse(tx, ty, bw, bw * 0.18, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      // Lichtpfütze auf dem Boden
      const pool = ctx.createRadialGradient(tx, ty, 0, tx, ty, bw * 1.3);
      pool.addColorStop(0, `rgba(255,220,180,${0.16 * fade})`);
      pool.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(tx, ty, bw * 1.3, bw * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Staub, der nur im Licht sichtbar wird
    for (const d of wd.motes) {
      if (!still) {
        d.x += (d.vx + m.x * 4) * dt;
        d.y += d.vy * dt;
        if (d.y < -4) d.y = h + 4;
        if (d.x < -4) d.x = w + 4;
        if (d.x > w + 4) d.x = -4;
      }
      let lit = 0.04;
      for (const a of axes) {
        const k = Math.max(0, Math.min(1, (d.y + 40) / (a.ty + 40)));
        const cx = a.ax + (a.tx - a.ax) * k;
        const half = 6 + a.bw * k;
        const dx = (d.x - cx) / half;
        lit += Math.exp(-dx * dx * 2.2) * (0.3 + 0.7 * k);
      }
      const tw = 0.6 + 0.4 * Math.sin(t * 2 + d.tw);
      ctx.globalAlpha = Math.min(1, lit) * tw * fade;
      ctx.fillStyle = '#ffe9cf';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Vignette
    const vig = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.85);
    vig.addColorStop(0, 'rgba(11,6,5,0)');
    vig.addColorStop(1, 'rgba(11,6,5,0.85)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  });

  return (
    <header className="hero" ref={sectionRef}>
      <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
      <div className="hero-inner">
        <p className="eyebrow reveal-up" style={{ animationDelay: '120ms' }}>
          {c.hero.eyebrow}
        </p>
        <h1 className="hero-title">
          <span className="line reveal-up" style={{ animationDelay: '220ms' }}>
            {c.hero.title1}
          </span>
          <span className="line glow reveal-up" style={{ animationDelay: '380ms' }}>
            {c.hero.title2}
          </span>
        </h1>
        <p className="hero-lead reveal-up" style={{ animationDelay: '560ms' }}>
          {c.hero.lead}
        </p>
        <div className="hero-actions reveal-up" style={{ animationDelay: '700ms' }}>
          <a className="cta" href="/app/">
            {c.hero.cta}
            <span aria-hidden="true">→</span>
          </a>
          <a className="ghost-link" href="#wait">
            {c.hero.try}
          </a>
        </div>
      </div>
      <a className="scroll-cue" href="#descent" aria-label={c.hero.scroll}>
        <span>{c.hero.scroll}</span>
        <i aria-hidden="true" />
      </a>
    </header>
  );
}
