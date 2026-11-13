import { describe, expect, it } from 'vitest';
import { hexToNumber, mix, numberToCss, oklchToNumber, pitchColor } from './colors';
import { drainFx, pushFx } from './fx-queue';
import { QUALITY, burstCount, burstLife } from './quality';

const channels = (n: number) => [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;

describe('Farben', () => {
  it('wandelt Hex hin und zurück', () => {
    expect(hexToNumber('#56B4E9')).toBe(0x56b4e9);
    expect(numberToCss(0x0a0b0c)).toBe('#0a0b0c');
    expect(hexToNumber('kaputt')).toBe(0xffffff);
  });

  it('rechnet OKLCH korrekt um (Weiß, Schwarz)', () => {
    expect(oklchToNumber(1, 0, 0)).toBe(0xffffff);
    expect(oklchToNumber(0, 0, 0)).toBe(0x000000);
  });

  it('Tonhöhe: links kühl (blau überwiegt), rechts warm (rot überwiegt)', () => {
    const [r1, , b1] = channels(pitchColor(21));
    const [r2, , b2] = channels(pitchColor(108));
    expect(b1).toBeGreaterThan(r1);
    expect(r2).toBeGreaterThan(b2);
    // benachbarte Töne unterscheiden sich nur wenig (gleichmäßiger Verlauf)
    const [ra, ga, ba] = channels(pitchColor(60));
    const [rb, gb, bb] = channels(pitchColor(61));
    expect(Math.abs(ra - rb) + Math.abs(ga - gb) + Math.abs(ba - bb)).toBeLessThan(40);
  });

  it('mischt Farben', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0x000000, 0xff0000, 0.5)).toBe(0x800000);
  });
});

describe('Qualitätsstufen', () => {
  it('mehr Funken bei höherer Stufe und stärkerem Anschlag', () => {
    const lo = burstCount('press', 0.5, 0.8, QUALITY.low);
    const mid = burstCount('press', 0.5, 0.8, QUALITY.medium);
    const hi = burstCount('press', 0.5, 0.8, QUALITY.high);
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
    expect(burstCount('press', 1, 0.8, QUALITY.medium)).toBeGreaterThan(
      burstCount('press', 0.2, 0.8, QUALITY.medium),
    );
  });

  it('Treffer ergeben einen Funkenschauer, kräftiger Anschlag lebt länger', () => {
    expect(burstCount('hit', 0.6, 1, QUALITY.medium)).toBeGreaterThan(
      burstCount('press', 0.6, 1, QUALITY.medium),
    );
    expect(burstLife(1)).toBeGreaterThan(burstLife(0.2));
  });

  it('Bloom nur auf Mittel und Hoch', () => {
    expect(QUALITY.low.bloom).toBe(false);
    expect(QUALITY.medium.bloom).not.toBe(false);
    expect(QUALITY.high.bloom).not.toBe(false);
  });
});

describe('Effekt-Warteschlange', () => {
  it('gibt Ereignisse einmal ab und bleibt begrenzt', () => {
    drainFx();
    for (let i = 0; i < 300; i++)
      pushFx({ kind: 'press', midi: 60, velocity: 1, strength: 1, hand: 'right' });
    expect(drainFx()).toHaveLength(256);
    expect(drainFx()).toHaveLength(0);
  });
});
