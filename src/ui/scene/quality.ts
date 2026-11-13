import type { VisualQuality } from '../store/settings';

export interface QualityProfile {
  /** Obergrenze gleichzeitiger Funken */
  maxParticles: number;
  /** Faktor auf die Funkenzahl je Anschlag */
  particleScale: number;
  /** Funken pro Sekunde und gehaltener Note */
  streamRate: number;
  bloom: false | { resolution: number; quality: number; blur: number };
  /** Weicher Lichtschein um Kapseln (ersetzt den Bloom auf „Niedrig“ nur teilweise) */
  halo: boolean;
  antialias: boolean;
}

export const QUALITY: Record<VisualQuality, QualityProfile> = {
  low: { maxParticles: 300, particleScale: 0.35, streamRate: 6, bloom: false, halo: true, antialias: false },
  medium: {
    maxParticles: 1400,
    particleScale: 0.75,
    streamRate: 14,
    bloom: { resolution: 0.5, quality: 4, blur: 6 },
    halo: true,
    antialias: true,
  },
  high: {
    maxParticles: 3200,
    particleScale: 1.2,
    streamRate: 24,
    bloom: { resolution: 1, quality: 6, blur: 9 },
    halo: true,
    antialias: true,
  },
};

/** Funken je Anschlag: Menge nach Anschlagstärke und Art */
export function burstCount(
  kind: 'press' | 'hit' | 'impact',
  velocity: number,
  strength: number,
  q: QualityProfile,
): number {
  const base = kind === 'hit' ? 34 + 46 * strength : kind === 'impact' ? 14 : 20;
  return Math.round((base + base * velocity) * q.particleScale);
}

/** Lebensdauer der Funken (s): kräftiger Anschlag = länger */
export function burstLife(velocity: number): number {
  return 0.45 + 0.75 * velocity;
}
