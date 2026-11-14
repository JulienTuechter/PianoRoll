/**
 * WebGL-Bühne mit PixiJS 8. Wird per dynamischem Import nachgeladen (eigener Chunk).
 *
 * Ebenen von hinten nach vorn:
 *   Hintergrund (Bahnen, Taktstriche, Loop)  →  Klaviatur (Tastenkörper, leuchtende Tasten)
 *   →  Leuchtebene mit Bloom (Notenkapseln, Lichtschein, Tastenlicht, Treffer-Linie, Funken)
 *   →  2D-Ebene für Text und Zeichen (Notennamen, Taktnummern, ✓ ✗ ↑ ↓, Simulator-Buchstaben), scharf ohne Bloom.
 * Kein DOM pro Note: Kapseln, Lichter und Funken sind wiederverwendete Sprites aus Pools.
 */
import {
  Application,
  Container,
  Graphics,
  isWebGLSupported,
  NineSliceSprite,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Texture,
} from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters';
import { firstNoteIndexAtOrAfter } from '../../core/note-event-model/notes';
import { drawFallingLabels, drawRisingLabels, noteVisibility } from '../canvas/falling-notes-renderer';
import { BLACK_HEIGHT_RATIO, type KeyboardLayout } from '../canvas/keyboard-layout';
import { drawKeyboardAnnotations } from '../canvas/keyboard-renderer';
import { theme } from '../theme';
import { hexToNumber, mix } from './colors';
import { QUALITY, burstCount, burstLife, type QualityProfile } from './quality';
import type { FxEvent, NoteRenderer, SceneFrame, SceneSize } from './types';

const BG = hexToNumber(theme.bg);
const LANE_BLACK = hexToNumber(theme.laneBlack);
const LANE_LINE = hexToNumber(theme.laneLine);
const MEASURE_LINE = hexToNumber(theme.measureLine);
const LOOP_LINE = hexToNumber(theme.loop);
const IVORY = hexToNumber(theme.whiteKey);
const IVORY_SHADE = hexToNumber(theme.whiteKeyShade);
const EBONY = hexToNumber(theme.blackKey);
const EBONY_TOP = hexToNumber(theme.blackKeyTop);
const LINE_COLOR = hexToNumber(theme.nowLine);
const LINE_GLOW = 0xff9a4a;
const WAIT_GLOW = hexToNumber(theme.waitGlow);
const WRONG = 0xff3b30;

/** Abmessungen der Kapsel-Textur (Nine-Slice: Ecken bleiben rund, die Mitte wird gestreckt) */
const CAP = { w: 24, h: 48, r: 7, border: 8, borderV: 9 };
const HALO = { w: 72, h: 104, pad: 22, border: 30, borderV: 34 };

function canvasOf(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Kapsel: weißer Umriss + innerer Verlauf (am Kopf hell). Weiß, damit `tint` die Notenfarbe setzt. */
function capsuleTexture(headAtBottom: boolean): Texture {
  const [c, ctx] = canvasOf(CAP.w, CAP.h);
  const g = ctx.createLinearGradient(0, 0, 0, CAP.h);
  const tail = 'rgba(255,255,255,0.16)';
  const head = 'rgba(255,255,255,0.78)';
  g.addColorStop(0, headAtBottom ? tail : head);
  g.addColorStop(1, headAtBottom ? head : tail);
  ctx.beginPath();
  ctx.roundRect(1, 1, CAP.w - 2, CAP.h - 2, CAP.r);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.stroke();
  return Texture.from(c);
}

/** Weicher Lichtschein um eine Kapsel */
function haloTexture(): Texture {
  const [c, ctx] = canvasOf(HALO.w, HALO.h);
  ctx.shadowColor = 'rgba(255,255,255,1)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(HALO.pad, HALO.pad, HALO.w - HALO.pad * 2, HALO.h - HALO.pad * 2, CAP.r);
  ctx.fill();
  return Texture.from(c);
}

/** Runder Lichtfleck (Tastenlicht, Funken) */
function radialTexture(size: number, core = 0): Texture {
  const [c, ctx] = canvasOf(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  if (core > 0) g.addColorStop(core, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

/** Vertikaler Verlauf: transparent oben → voll unten (Führungsstrahl) bzw. symmetrisch (Lichtband) */
function rampTexture(symmetric: boolean): Texture {
  const [c, ctx] = canvasOf(4, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  if (symmetric) g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1, symmetric ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,1)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 64);
  return Texture.from(c);
}

/** Tastenform mit unten abgerundeten Ecken */
function keyPath(g: Graphics, x: number, y: number, w: number, h: number, r: number): Graphics {
  return g
    .moveTo(x, y)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .closePath();
}

/** Wiederverwendbare Sprites: pro Frame von vorn vergeben, Rest unsichtbar */
class Pool<T extends Container> {
  private items: T[] = [];
  private used = 0;
  constructor(
    private readonly parent: Container,
    private readonly create: () => T,
  ) {}
  begin(): void {
    this.used = 0;
  }
  next(): T {
    let item = this.items[this.used];
    if (!item) {
      item = this.create();
      this.items.push(item);
      this.parent.addChild(item);
    }
    this.used++;
    item.visible = true;
    return item;
  }
  end(): void {
    for (let i = this.used; i < this.items.length; i++) this.items[i]!.visible = false;
  }
}

/** Funken als Struktur aus Arrays (keine Objekte pro Funke im Takt) */
class Sparks {
  readonly container: ParticleContainer;
  private readonly sprites: Particle[] = [];
  private x: Float32Array;
  private y: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private size: Float32Array;
  private color: Uint32Array;
  private count = 0;

  constructor(
    readonly max: number,
    texture: Texture,
  ) {
    this.container = new ParticleContainer({
      texture,
      dynamicProperties: { position: true, color: true, vertex: true, rotation: false, uvs: false },
    });
    this.container.blendMode = 'add';
    for (let i = 0; i < max; i++) {
      const p = new Particle({ texture, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
      this.sprites.push(p);
      this.container.addParticle(p);
    }
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.color = new Uint32Array(max);
  }

  spawn(x: number, y: number, vx: number, vy: number, life: number, size: number, color: number): void {
    if (this.count >= this.max) return;
    const i = this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.color[i] = color;
  }

  /** Aufsteigende Funken: Startimpuls nach oben, Luftwiderstand, leichter Fall am Ende */
  update(dt: number): void {
    const drag = Math.max(0, 1 - 2.2 * dt);
    let w = 0;
    for (let i = 0; i < this.count; i++) {
      const life = this.life[i]! - dt;
      if (life <= 0) continue;
      const vx = this.vx[i]! * drag;
      const vy = this.vy[i]! * drag + 160 * dt;
      this.x[w] = this.x[i]! + vx * dt;
      this.y[w] = this.y[i]! + vy * dt;
      this.vx[w] = vx;
      this.vy[w] = vy;
      this.life[w] = life;
      this.maxLife[w] = this.maxLife[i]!;
      this.size[w] = this.size[i]!;
      this.color[w] = this.color[i]!;
      w++;
    }
    this.count = w;
    for (let i = 0; i < this.max; i++) {
      const p = this.sprites[i]!;
      if (i >= this.count) {
        if (p.alpha !== 0) p.alpha = 0;
        continue;
      }
      const t = this.life[i]! / this.maxLife[i]!;
      p.x = this.x[i]!;
      p.y = this.y[i]!;
      p.alpha = Math.min(1, t * 1.4);
      const s = this.size[i]! * (0.55 + 0.45 * t);
      p.scaleX = s;
      p.scaleY = s;
      p.tint = this.color[i]!;
    }
  }

  clear(): void {
    this.count = 0;
  }
}

export class PixiRenderer implements NoteRenderer {
  readonly kind = 'webgl' as const;

  static supported(): boolean {
    return isWebGLSupported();
  }

  private app: Application | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D | null = null;
  private size: SceneSize = { width: 0, fallHeight: 0, keyboardHeight: 0, dpr: 1 };

  // Ebenen
  private readonly lanes = new Graphics();
  private readonly dyn = new Graphics();
  private readonly keyboard = new Container();
  private readonly whiteBase = new Graphics();
  private readonly whiteLit = new Graphics();
  private readonly blackBase = new Graphics();
  private readonly blackLit = new Graphics();
  private readonly emissive = new Container();
  private readonly beamLayer = new Container();
  private readonly haloLayer = new Container();
  private readonly noteLayer = new Container();
  private readonly glowLayer = new Container();
  private readonly lineGlow = new Sprite();
  private readonly line = new Graphics();

  // Texturen und Pools (in mount angelegt)
  private tex!: {
    capDown: Texture;
    capUp: Texture;
    halo: Texture;
    glow: Texture;
    spark: Texture;
    beam: Texture;
    band: Texture;
  };
  private notes!: Pool<NineSliceSprite>;
  private notesUp!: Pool<NineSliceSprite>;
  private halos!: Pool<NineSliceSprite>;
  private glows!: Pool<Sprite>;
  private beams!: Pool<Sprite>;
  private sparks: Sparks | null = null;
  private bloom: AdvancedBloomFilter | null = null;
  private quality: QualityProfile | null = null;
  private qualityKey = '';

  // Zustand der Effekte
  private lineBoost = 0;
  private readonly flashes: { midi: number; color: number; t: number; wrong: boolean }[] = [];
  private readonly streamAcc = new Map<number, number>();

  async mount(host: HTMLElement, size: SceneSize): Promise<void> {
    const app = new Application();
    await app.init({
      width: Math.max(1, size.width),
      height: Math.max(1, size.fallHeight + size.keyboardHeight),
      resolution: size.dpr,
      autoDensity: true,
      antialias: true,
      background: BG,
      preference: 'webgl',
      powerPreference: 'high-performance',
      autoStart: false,
      sharedTicker: false,
    });
    app.ticker.stop();
    this.app = app;
    app.canvas.classList.add('scene-canvas');
    app.canvas.setAttribute('aria-hidden', 'true');
    host.prepend(app.canvas);

    const overlay = document.createElement('canvas');
    overlay.className = 'scene-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    host.append(overlay);
    this.overlay = overlay;
    this.octx = overlay.getContext('2d');

    this.tex = {
      capDown: capsuleTexture(true),
      capUp: capsuleTexture(false),
      halo: haloTexture(),
      glow: radialTexture(128),
      spark: radialTexture(32, 0.25),
      beam: rampTexture(false),
      band: rampTexture(true),
    };

    const nine = (texture: Texture, b: number, bv: number) => () => {
      const s = new NineSliceSprite({
        texture,
        leftWidth: b,
        rightWidth: b,
        topHeight: bv,
        bottomHeight: bv,
      });
      s.blendMode = 'add';
      return s;
    };
    const sprite = (texture: Texture, ax: number, ay: number) => () => {
      const s = new Sprite(texture);
      s.anchor.set(ax, ay);
      s.blendMode = 'add';
      return s;
    };
    this.halos = new Pool(this.haloLayer, nine(this.tex.halo, HALO.border, HALO.borderV));
    this.notes = new Pool(this.noteLayer, nine(this.tex.capDown, CAP.border, CAP.borderV));
    this.notesUp = new Pool(this.noteLayer, nine(this.tex.capUp, CAP.border, CAP.borderV));
    this.glows = new Pool(this.glowLayer, sprite(this.tex.glow, 0.5, 0.5));
    this.beams = new Pool(this.beamLayer, sprite(this.tex.beam, 0, 0));

    this.lineGlow.texture = this.tex.band;
    this.lineGlow.anchor.set(0, 0.5);
    this.lineGlow.blendMode = 'add';

    this.keyboard.addChild(this.whiteBase, this.whiteLit, this.blackBase, this.blackLit);
    this.emissive.addChild(
      this.beamLayer,
      this.haloLayer,
      this.noteLayer,
      this.glowLayer,
      this.lineGlow,
      this.line,
    );
    app.stage.addChild(this.lanes, this.dyn, this.keyboard, this.emissive);

    this.resize(size);
  }

  resize(size: SceneSize): void {
    this.size = size;
    const app = this.app;
    if (!app) return;
    const h = size.fallHeight + size.keyboardHeight;
    app.renderer.resolution = size.dpr;
    app.renderer.resize(Math.max(1, size.width), Math.max(1, h));
    if (this.overlay) {
      this.overlay.style.width = `${size.width}px`;
      this.overlay.style.height = `${h}px`;
      this.overlay.width = Math.max(1, Math.round(size.width * size.dpr));
      this.overlay.height = Math.max(1, Math.round(h * size.dpr));
    }
    const area = new Rectangle(0, 0, Math.max(1, size.width), Math.max(1, h));
    this.emissive.filterArea = area;
    if (this.sparks) this.sparks.container.boundsArea = area;
    this.keyboard.y = size.fallHeight;
    this.lineGlow.width = size.width;
    this.lineGlow.height = 36;
    this.lineGlow.y = size.fallHeight;
    this.line
      .clear()
      .rect(0, size.fallHeight - 1, size.width, 2)
      .fill(LINE_COLOR);
    this.layoutDirty = true;
  }

  private layoutDirty = true;
  private builtFor: KeyboardLayout | null = null;

  /** Statische Teile: Bahnen der schwarzen Tasten, Oktavlinien, Tastenkörper */
  private buildStatic(layout: KeyboardLayout): void {
    const { fallHeight: fh, keyboardHeight: kh } = this.size;
    this.lanes.clear();
    if (fh > 0) {
      for (const k of layout.blacks) this.lanes.rect(k.x, 0, k.w, fh).fill(LANE_BLACK);
      for (const k of layout.whites)
        if (k.midi % 12 === 0 || k.midi % 12 === 5)
          this.lanes.rect(Math.round(k.x), 0, 1, fh).fill(LANE_LINE);
    }
    const r = Math.min(4, layout.whiteWidth * 0.2);
    const bh = kh * BLACK_HEIGHT_RATIO;
    this.whiteBase.clear().rect(0, 0, layout.width, kh).fill(hexToNumber(theme.keyBorder));
    for (const k of layout.whites) {
      keyPath(this.whiteBase, k.x + 0.5, 0, k.w - 1, kh - 1, r).fill(IVORY);
      this.whiteBase.rect(k.x + 0.5, kh - 6, k.w - 1, 5).fill({ color: IVORY_SHADE, alpha: 0.35 });
    }
    this.blackBase.clear();
    for (const k of layout.blacks) {
      keyPath(this.blackBase, k.x, 0, k.w, bh, r * 0.6).fill(EBONY);
      this.blackBase.rect(k.x + k.w * 0.18, bh - 8, k.w * 0.64, 5).fill(EBONY_TOP);
    }
    this.builtFor = layout;
    this.layoutDirty = false;
  }

  private applyQuality(key: string, reducedMotion: boolean): void {
    const q = QUALITY[key as keyof typeof QUALITY];
    const full = `${key}-${reducedMotion}`;
    if (full === this.qualityKey) return;
    this.qualityKey = full;
    this.quality = q;
    if (q.bloom) {
      this.bloom ??= new AdvancedBloomFilter({ threshold: 0.18, bloomScale: 1.05, brightness: 1 });
      this.bloom.blur = q.bloom.blur;
      this.bloom.quality = q.bloom.quality;
      this.bloom.resolution = q.bloom.resolution;
      this.emissive.filters = [this.bloom];
    } else {
      this.emissive.filters = [];
    }
    const max = reducedMotion ? 0 : q.maxParticles;
    if (!this.sparks || this.sparks.max !== max) {
      if (this.sparks) {
        this.emissive.removeChild(this.sparks.container);
        this.sparks.container.destroy();
      }
      this.sparks = max > 0 ? new Sparks(max, this.tex.spark) : null;
      if (this.sparks) {
        this.sparks.container.boundsArea = new Rectangle(
          0,
          0,
          this.size.width,
          this.size.fallHeight + this.size.keyboardHeight,
        );
        this.emissive.addChild(this.sparks.container);
      }
    }
  }

  render(f: SceneFrame): void {
    const app = this.app;
    if (!app || this.size.width <= 0) return;
    this.applyQuality(f.quality, f.reducedMotion);
    const q = this.quality!;
    if (this.layoutDirty || this.builtFor !== f.layout) this.buildStatic(f.layout);

    const t = f.nowMs / 1000;
    const motion = !f.reducedMotion;
    this.dyn.clear();
    this.halos.begin();
    this.notes.begin();
    this.notesUp.begin();
    this.glows.begin();
    this.beams.begin();

    if (this.size.fallHeight > 0) {
      if (f.falling.kind === 'song') this.drawFalling(f, q, t, motion);
      else this.drawRising(f, q);
    }
    this.drawKeys(f, t, motion);
    this.drawEffects(f, q, t, motion);

    this.halos.end();
    this.notes.end();
    this.notesUp.end();
    this.glows.end();
    this.beams.end();
    this.sparks?.update(f.dt);

    app.render();
    this.drawOverlay(f);
  }

  private drawFalling(f: SceneFrame, q: QualityProfile, t: number, motion: boolean): void {
    if (f.falling.kind !== 'song') return;
    const fr = f.falling.frame;
    const { layout } = f;
    const fh = this.size.fallHeight;
    const w = this.size.width;
    const pxPerSec = fh / fr.windowSec;
    const yFor = (sec: number) => fh - (sec - fr.positionSec) * pxPerSec;
    const endVisible = fr.positionSec + fr.windowSec;

    for (const m of fr.measures) {
      if (m.startSec < fr.positionSec - 0.01) continue;
      if (m.startSec > endVisible) break;
      this.dyn.rect(0, Math.round(yFor(m.startSec)), w, 1).fill(MEASURE_LINE);
    }
    if (fr.loop) {
      const yStart = yFor(fr.loop.startSec);
      const yEnd = yFor(fr.loop.endSec);
      if (yEnd > 0) this.dyn.rect(0, 0, w, Math.min(fh, yEnd)).fill({ color: 0x000000, alpha: 0.4 });
      if (yStart < fh)
        this.dyn
          .rect(0, Math.max(0, yStart), w, fh - Math.max(0, yStart))
          .fill({ color: 0x000000, alpha: 0.4 });
      if (yEnd >= 0 && yEnd <= fh) this.dyn.rect(0, Math.round(yEnd) - 1, w, 2).fill(LOOP_LINE);
      if (yStart >= 0 && yStart <= fh) this.dyn.rect(0, Math.round(yStart) - 1, w, 2).fill(LOOP_LINE);
    }

    // Anfängermodus: Führungsstrahl von der kommenden Note zur Taste
    if (fr.beginner) {
      const lead = Math.min(fr.windowSec, 2.5);
      for (let i = firstNoteIndexAtOrAfter(fr.notes, fr.positionSec - 1e-6); i < fr.notes.length; i++) {
        const n = fr.notes[i]!;
        if (n.startSec > fr.positionSec + lead) break;
        const vis = noteVisibility(n, fr);
        if (vis.hidden || vis.accompaniment || vis.alpha < 0.5 || n.startSec < fr.positionSec - 1e-6)
          continue;
        const k = layout.byMidi[n.midi];
        if (!k) continue;
        const prox = 1 - (n.startSec - fr.positionSec) / lead;
        const yBottom = Math.max(0, yFor(n.startSec));
        const inset = k.black ? 1 : Math.max(2, k.w * 0.18);
        const b = this.beams.next();
        b.x = k.x + inset;
        b.y = yBottom;
        b.width = k.w - inset * 2;
        b.height = fh - yBottom;
        b.tint = f.colorOf(n.midi, n.hand);
        b.alpha = 0.15 + 0.4 * prox;
      }
    }

    const pulse = motion ? 0.5 + 0.5 * Math.sin(t * Math.PI * 4) : 1;
    for (
      let i = firstNoteIndexAtOrAfter(fr.notes, fr.positionSec - fr.maxDurationSec);
      i < fr.notes.length;
      i++
    ) {
      const n = fr.notes[i]!;
      if (n.startSec > endVisible) break;
      const end = n.startSec + n.durationSec;
      if (end < fr.positionSec) continue;
      const k = layout.byMidi[n.midi];
      if (!k) continue;
      const vis = noteVisibility(n, fr);
      if (vis.hidden) continue;
      const yBottom = Math.min(fh, yFor(n.startSec));
      const yTop = yFor(end);
      const h = Math.max(6, yBottom - yTop - 1);
      const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
      const color = f.colorOf(n.midi, n.hand);
      const current = fr.currentIds?.has(n.id) ?? false;
      // Erwartete Note pulsiert (Kapsel und Schein), klingende Note glüht voll
      const glow = current ? 0.55 + 0.45 * pulse : vis.playing ? 1 : 0.55;

      const cap = this.notes.next();
      cap.x = k.x + inset;
      cap.y = yBottom - h;
      cap.width = k.w - inset * 2;
      cap.height = h;
      cap.tint = current && motion ? mix(color, 0xffffff, 0.35 * pulse) : color;
      cap.alpha = vis.alpha;

      if (q.halo && vis.alpha > 0.25) {
        const hs = this.halos.next();
        hs.x = cap.x - HALO.pad;
        hs.y = cap.y - HALO.pad;
        hs.width = cap.width + HALO.pad * 2;
        hs.height = h + HALO.pad * 2;
        hs.tint = color;
        hs.alpha = 0.35 * glow * vis.alpha;
      }
    }
  }

  private drawRising(f: SceneFrame, q: QualityProfile): void {
    if (f.falling.kind !== 'free') return;
    const fr = f.falling.frame;
    const fh = this.size.fallHeight;
    const pxPerMs = fh / (fr.windowSec * 1000);
    const yFor = (ms: number) => fh - (fr.nowMs - ms) * pxPerMs;
    for (const m of fr.marks) {
      const y = Math.round(yFor(m.timeMs));
      if (y >= 0 && y <= fh) this.dyn.rect(0, y, this.size.width, 1).fill(MEASURE_LINE);
    }
    for (const n of fr.notes) {
      const k = f.layout.byMidi[n.midi];
      if (!k) continue;
      const yTop = yFor(n.startMs);
      const yBottom = n.endMs === null ? fh : yFor(n.endMs);
      if (yTop > fh || yBottom < 0) continue;
      const h = Math.max(6, yBottom - yTop);
      const inset = k.black ? 0.5 : Math.max(1, k.w * 0.08);
      const color = f.colorOf(n.midi, n.midi < fr.splitPoint ? 'left' : 'right');
      const held = n.endMs === null;
      // Anschlagstärke über Leuchtkraft; gehaltene Noten voll
      const alpha = held ? 1 : 0.45 + 0.45 * n.velocity;
      const cap = this.notesUp.next();
      cap.x = k.x + inset;
      cap.y = yTop;
      cap.width = k.w - inset * 2;
      cap.height = h;
      cap.tint = color;
      cap.alpha = alpha;
      if (q.halo) {
        const hs = this.halos.next();
        hs.x = cap.x - HALO.pad;
        hs.y = yTop - HALO.pad;
        hs.width = cap.width + HALO.pad * 2;
        hs.height = h + HALO.pad * 2;
        hs.tint = color;
        hs.alpha = (held ? 0.5 : 0.25) * alpha;
      }
    }
  }

  /** Leuchtende Tasten in Notenfarbe, Lichtschein auf die Nachbartasten, rotes Flackern bei falschen Tasten */
  private drawKeys(f: SceneFrame, t: number, motion: boolean): void {
    const { layout } = f;
    const fh = this.size.fallHeight;
    const kh = this.size.keyboardHeight;
    const r = Math.min(4, layout.whiteWidth * 0.2);
    const bh = kh * BLACK_HEIGHT_RATIO;
    const flicker = motion ? Math.floor(f.nowMs / 45) % 2 === 0 : true;
    const pulse = motion ? 0.5 + 0.5 * Math.sin(t * Math.PI * 4) : 1;
    this.whiteLit.clear();
    this.blackLit.clear();

    for (const l of f.lights) {
      const k = layout.byMidi[l.midi];
      if (!k) continue;
      let amount: number;
      let color = l.color;
      if (l.wrong) {
        color = WRONG;
        amount = flicker ? 0.8 : 0.3;
      } else if (l.expected) {
        amount = (0.18 + 0.3 * pulse) * (l.intensity / 0.45);
      } else {
        amount = 0.45 + 0.4 * l.intensity;
      }
      amount = Math.min(0.92, amount);
      if (k.black) keyPath(this.blackLit, k.x, 0, k.w, bh, r * 0.6).fill(mix(EBONY, color, amount));
      else keyPath(this.whiteLit, k.x + 0.5, 0, k.w - 1, kh - 1, r).fill(mix(IVORY, color, amount));

      // Lichtschein: um die Treffer-Linie, auf die Nachbartasten und ein Stück in den Notenbereich
      const g = this.glows.next();
      g.x = k.x + k.w / 2;
      g.y = fh;
      g.tint = color;
      if (l.wrong) {
        g.width = layout.whiteWidth * 2.2;
        g.height = kh * 0.7;
        g.alpha = flicker ? 0.55 : 0.1;
      } else {
        const strength = l.expected ? 0.2 + 0.3 * pulse : 0.35 + 0.45 * l.intensity;
        g.width = layout.whiteWidth * (3 + 2.5 * l.intensity);
        g.height = kh * 1.3;
        g.alpha = strength;
      }
    }
  }

  private drawEffects(f: SceneFrame, q: QualityProfile, t: number, motion: boolean): void {
    const { layout } = f;
    const fh = this.size.fallHeight;
    const sparks = motion && fh > 0 ? this.sparks : null;

    for (const e of f.events) {
      const k = layout.byMidi[e.midi];
      if (!k) continue;
      const x = k.x + k.w / 2;
      if (e.kind === 'wrong') {
        this.flashes.push({ midi: e.midi, color: WRONG, t: f.nowMs, wrong: true });
        continue;
      }
      if (e.kind === 'hit') {
        this.flashes.push({ midi: e.midi, color: e.color, t: f.nowMs, wrong: false });
        this.lineBoost = Math.min(1, this.lineBoost + 0.35 * e.strength);
      } else {
        this.lineBoost = Math.min(1, this.lineBoost + 0.12);
      }
      if (sparks) this.burst(sparks, e, x, fh, k.w, q);
    }

    // Dünner Funkenstrom über gehaltenen Noten
    if (sparks) {
      for (const h of f.held) {
        const k = layout.byMidi[h.midi];
        if (!k) continue;
        let acc = (this.streamAcc.get(h.midi) ?? Math.random()) + q.streamRate * f.dt;
        while (acc >= 1) {
          acc -= 1;
          sparks.spawn(
            k.x + k.w / 2 + (Math.random() - 0.5) * k.w * 0.5,
            fh - 1,
            (Math.random() - 0.5) * 30,
            -(60 + Math.random() * 120),
            0.3 + Math.random() * 0.45,
            0.18 + Math.random() * 0.14,
            h.color,
          );
        }
        this.streamAcc.set(h.midi, acc);
      }
      if (this.streamAcc.size > 64) this.streamAcc.clear();
    } else if (this.sparks) {
      this.sparks.clear();
    }

    // Treffer: kurzer heller Blitz; falsche Taste: kurzes rotes Flackern (ohne Funken)
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const fl = this.flashes[i]!;
      const age = (f.nowMs - fl.t) / (fl.wrong ? 260 : 320);
      const k = layout.byMidi[fl.midi];
      if (age >= 1 || !k) {
        this.flashes.splice(i, 1);
        continue;
      }
      const g = this.glows.next();
      g.x = k.x + k.w / 2;
      g.y = fh;
      g.tint = fl.wrong ? WRONG : mix(fl.color, 0xffffff, 0.5);
      if (fl.wrong) {
        const on = motion ? Math.floor((f.nowMs - fl.t) / 45) % 2 === 0 : true;
        g.width = layout.whiteWidth * 2.4;
        g.height = this.size.keyboardHeight * 0.8;
        g.alpha = on ? 0.7 * (1 - age) : 0.08;
      } else {
        g.width = layout.whiteWidth * (5 + 4 * age);
        g.height = this.size.keyboardHeight * (1.2 + age);
        g.alpha = 0.9 * (1 - age) ** 2;
      }
    }

    // Treffer-Linie: glüht, zuckt leicht, wird bei Treffern heller; beim Warten pulsiert sie hell
    const waiting = f.falling.kind === 'song' && f.falling.frame.waiting;
    this.lineBoost *= Math.exp(-4 * f.dt);
    const flick = motion
      ? 0.9 + 0.06 * Math.sin(t * 37) * Math.sin(t * 13.7) + 0.04 * (Math.random() - 0.5)
      : 1;
    const waitPulse = waiting ? (motion ? 0.5 + 0.5 * Math.sin(t * Math.PI * 1.6) : 0.7) : 0;
    this.lineGlow.tint = waiting ? mix(LINE_GLOW, WAIT_GLOW, 0.5 * waitPulse) : LINE_GLOW;
    this.lineGlow.alpha = Math.min(1, (0.42 + 0.45 * this.lineBoost + 0.25 * waitPulse) * flick);
    this.lineGlow.y = fh + (motion ? (Math.random() - 0.5) * 0.8 : 0);
    this.line.alpha = Math.min(1, 0.85 + 0.15 * flick + 0.2 * this.lineBoost);
  }

  private burst(sparks: Sparks, e: FxEvent, x: number, y: number, keyW: number, q: QualityProfile): void {
    const kind = e.kind === 'wrong' ? 'press' : e.kind;
    const n = burstCount(kind, e.velocity, e.strength, q);
    const life = burstLife(e.velocity);
    const power = 0.6 + 0.7 * e.velocity;
    const spread = kind === 'hit' ? 1.05 : 0.7;
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
      const speed = (140 + Math.random() * 360) * power * (kind === 'hit' ? 1.15 : 1);
      // Mischung aus Notenfarbe und weißglühenden Funken
      const color = Math.random() < 0.25 ? mix(e.color, 0xffffff, 0.7) : e.color;
      sparks.spawn(
        x + (Math.random() - 0.5) * keyW * 0.8,
        y - 1,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life * (0.5 + Math.random() * 0.5),
        0.18 + Math.random() * 0.32,
        color,
      );
    }
  }

  /** Text und Zeichen scharf über dem WebGL-Bild */
  private drawOverlay(f: SceneFrame): void {
    const ctx = this.octx;
    if (!ctx) return;
    const { width, fallHeight: fh, keyboardHeight: kh, dpr } = this.size;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, fh + kh);
    if (fh > 0) {
      if (f.falling.kind === 'song') drawFallingLabels(ctx, f.layout, fh, f.falling.frame);
      else drawRisingLabels(ctx, f.layout, fh, f.falling.frame);
    }
    ctx.translate(0, fh);
    drawKeyboardAnnotations(ctx, f.layout, kh, f.keyboard);
  }

  destroy(): void {
    this.overlay?.remove();
    this.overlay = null;
    this.octx = null;
    const app = this.app;
    this.app = null;
    if (app) {
      app.canvas.remove();
      app.destroy(true, { children: true, texture: true });
    }
  }
}
