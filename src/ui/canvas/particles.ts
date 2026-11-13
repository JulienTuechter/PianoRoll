/**
 * Leichtgewichtiges Partikelsystem für Funkeneffekte (Canvas, additive Mischung).
 * Feste Obergrenze und Wiederverwendung der Objekte, damit 60 fps ohne GC-Ruckler gehalten werden.
 */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class ParticleSystem {
  readonly particles: Particle[] = [];
  private readonly pool: Particle[] = [];

  constructor(
    readonly max = 1400,
    /** Schwerkraft in px/s² (positiv = nach unten) */
    private readonly gravity = 260,
    /** Zufallsquelle (für Tests deterministisch) */
    private readonly rand: () => number = Math.random,
  ) {}

  get count(): number {
    return this.particles.length;
  }

  private spawn(p: Omit<Particle, 'maxLife'>): void {
    if (this.particles.length >= this.max) return;
    const obj = this.pool.pop() ?? ({} as Particle);
    Object.assign(obj, p, { maxLife: p.life });
    this.particles.push(obj);
  }

  /** Explosion nach oben (Aufprall eines Balkens auf der Klaviatur bzw. Anschlag im freien Spiel). */
  burst(x: number, y: number, color: string, count = 26, spread = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (this.rand() - 0.5) * Math.PI * 0.9 * spread;
      const speed = 120 + this.rand() * 320;
      this.spawn({
        x: x + (this.rand() - 0.5) * 8,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.35 + this.rand() * 0.55,
        size: 1.2 + this.rand() * 2.6,
        color,
      });
    }
  }

  /** Einzelne aufsteigende Funken (solange eine Note klingt). */
  sparkle(x: number, y: number, width: number, color: string, count = 2): void {
    for (let i = 0; i < count; i++) {
      this.spawn({
        x: x + (this.rand() - 0.5) * width,
        y,
        vx: (this.rand() - 0.5) * 60,
        vy: -(60 + this.rand() * 160),
        life: 0.25 + this.rand() * 0.45,
        size: 0.8 + this.rand() * 1.8,
        color,
      });
    }
  }

  update(dtSec: number): void {
    const dt = Math.min(0.05, Math.max(0, dtSec));
    let w = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        continue;
      }
      p.vy += this.gravity * dt;
      p.vx *= 1 - 1.5 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.particles[w++] = p;
    }
    this.particles.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      // farbiger Schein + heller Kern
      ctx.globalAlpha = t * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = t;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  clear(): void {
    this.pool.push(...this.particles);
    this.particles.length = 0;
  }
}
