/**
 * Canvas-2D-Bühne: schlichte fallende Noten, wenn Animationen aus sind, sonst Fallback,
 * bis PixiJS geladen ist, und dauerhaft ohne WebGL.
 * Zeichnet mit den bewährten 2D-Funktionen, kennt Farbmodus, Funken und Qualitätsstufen, aber keinen Bloom.
 */
import { drawFallingNotes, drawRisingNotes } from '../canvas/falling-notes-renderer';
import { drawKeyboard } from '../canvas/keyboard-renderer';
import { ParticleSystem } from '../canvas/particles';
import { numberToCss } from './colors';
import { QUALITY, burstCount } from './quality';
import type { NoteRenderer, SceneFrame, SceneSize } from './types';

export class Canvas2DRenderer implements NoteRenderer {
  readonly kind = 'canvas2d' as const;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private size: SceneSize = { width: 0, fallHeight: 0, keyboardHeight: 0, dpr: 1 };
  private ps = new ParticleSystem(QUALITY.medium.maxParticles);
  private psQuality = 'medium';
  /** Rotes Flackern falscher Tasten: midi → Ende (ms) */
  private readonly wrongUntil = new Map<number, number>();

  mount(host: HTMLElement, size: SceneSize): Promise<void> {
    const canvas = document.createElement('canvas');
    canvas.className = 'scene-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    host.prepend(canvas);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.resize(size);
    return Promise.resolve();
  }

  resize(size: SceneSize): void {
    this.size = size;
    const c = this.canvas;
    if (!c || !this.ctx) return;
    const h = size.fallHeight + size.keyboardHeight;
    c.style.width = `${size.width}px`;
    c.style.height = `${h}px`;
    c.width = Math.max(1, Math.round(size.width * size.dpr));
    c.height = Math.max(1, Math.round(h * size.dpr));
  }

  render(f: SceneFrame): void {
    const ctx = this.ctx;
    const { fallHeight, keyboardHeight, dpr } = this.size;
    if (!ctx || this.size.width <= 0) return;
    const q = QUALITY[f.quality];
    if (this.psQuality !== f.quality) {
      this.ps = new ParticleSystem(q.maxParticles);
      this.psQuality = f.quality;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (fallHeight > 0) {
      if (f.falling.kind === 'song')
        drawFallingNotes(ctx, f.layout, fallHeight, { ...f.falling.frame, still: f.reducedMotion });
      else drawRisingNotes(ctx, f.layout, fallHeight, f.falling.frame);
    }

    ctx.save();
    ctx.translate(0, fallHeight);
    drawKeyboard(ctx, f.layout, keyboardHeight, { ...f.keyboard, still: f.reducedMotion });
    // Falsche Taste: kurzes rotes Flackern
    for (const e of f.events) if (e.kind === 'wrong') this.wrongUntil.set(e.midi, f.nowMs + 260);
    for (const [midi, until] of this.wrongUntil) {
      const k = f.layout.byMidi[midi];
      if (!k || until < f.nowMs) {
        this.wrongUntil.delete(midi);
        continue;
      }
      if (!f.reducedMotion && Math.floor(f.nowMs / 45) % 2 === 1) continue;
      ctx.fillStyle = 'rgba(255, 59, 48, 0.55)';
      ctx.fillRect(k.x + 1, 2, k.w - 2, (k.black ? keyboardHeight * 0.62 : keyboardHeight) - 3);
    }
    ctx.restore();

    // Funken (bei reduzierter Bewegung aus)
    if (f.reducedMotion || fallHeight <= 0) {
      if (this.ps.count > 0) this.ps.clear();
      return;
    }
    for (const e of f.events) {
      if (e.kind === 'wrong') continue;
      const k = f.layout.byMidi[e.midi];
      if (k)
        this.ps.burst(
          k.x + k.w / 2,
          fallHeight,
          numberToCss(e.color),
          burstCount(e.kind, e.velocity, e.strength, q),
        );
    }
    for (const h of f.held) {
      const k = f.layout.byMidi[h.midi];
      if (k && Math.random() < q.streamRate * f.dt)
        this.ps.sparkle(k.x + k.w / 2, fallHeight, k.w * 0.6, numberToCss(h.color), 1);
    }
    this.ps.update(f.dt);
    this.ps.draw(ctx);
  }

  destroy(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
    this.ps.clear();
  }
}
