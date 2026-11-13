import { describe, expect, it } from 'vitest';
import { ParticleSystem } from './particles';

/** deterministischer Zufall */
function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

describe('ParticleSystem', () => {
  it('erzeugt Funken nach oben und lässt sie verglühen', () => {
    const ps = new ParticleSystem(1000, 260, seeded());
    ps.burst(100, 500, '#56b4e9', 20);
    expect(ps.count).toBe(20);
    expect(ps.particles.every((p) => p.vy < 0)).toBe(true);
    ps.update(0.016);
    expect(ps.particles.every((p) => p.y < 500)).toBe(true);
    for (let i = 0; i < 80; i++) ps.update(0.016);
    expect(ps.count).toBe(0);
  });

  it('hält die Obergrenze ein und verwendet Objekte wieder', () => {
    const ps = new ParticleSystem(50, 260, seeded(7));
    ps.burst(0, 0, '#fff', 200);
    expect(ps.count).toBe(50);
    const old = new Set(ps.particles);
    for (let i = 0; i < 100; i++) ps.update(0.05);
    ps.sparkle(0, 0, 10, '#fff', 1);
    expect(old.has(ps.particles[0]!)).toBe(true);
  });

  it('begrenzt große Zeitsprünge (z. B. nach Tab-Wechsel)', () => {
    const ps = new ParticleSystem(10, 0, seeded(3));
    ps.sparkle(0, 100, 0, '#fff', 1);
    const p = ps.particles[0]!;
    const y0 = p.y;
    const vy = p.vy;
    ps.update(5);
    expect(p.y).toBeCloseTo(y0 + vy * 0.05, 5);
  });
});
