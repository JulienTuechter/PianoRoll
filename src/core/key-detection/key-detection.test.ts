import { describe, expect, it } from 'vitest';
import { allKeys, keyLabel, keyUsesFlats, parseKey } from './key';
import { estimateKey, KeyTracker } from './krumhansl';

function hist(pcs: Record<number, number>): number[] {
  return Array.from({ length: 12 }, (_, i) => pcs[i] ?? 0);
}

describe('Tonart-Helfer', () => {
  it('benennt Tonarten deutsch', () => {
    expect(keyLabel({ tonicPc: 0, mode: 'major' })).toBe('C-Dur');
    expect(keyLabel({ tonicPc: 9, mode: 'minor' })).toBe('a-Moll');
    expect(keyLabel({ tonicPc: 10, mode: 'major' })).toBe('B♭-Dur');
    expect(keyLabel({ tonicPc: 6, mode: 'minor' })).toBe('f♯-Moll');
  });
  it('kennt b-Tonarten', () => {
    expect(keyUsesFlats({ tonicPc: 5, mode: 'major' })).toBe(true);
    expect(keyUsesFlats({ tonicPc: 2, mode: 'minor' })).toBe(true);
    expect(keyUsesFlats({ tonicPc: 7, mode: 'major' })).toBe(false);
    expect(allKeys()).toHaveLength(24);
    expect(parseKey('Bb', 'major')).toEqual({ tonicPc: 10, mode: 'major' });
    expect(parseKey('x', 'major')).toBeNull();
  });
});

describe('Krumhansl-Schmuckler', () => {
  it('erkennt C-Dur aus der Tonleiter mit betonter Tonika', () => {
    const e = estimateKey(hist({ 0: 4, 2: 2, 4: 3, 5: 2, 7: 3, 9: 2, 11: 1 }))!;
    expect(e.key).toEqual({ tonicPc: 0, mode: 'major' });
  });

  it('erkennt a-Moll (harmonisch, mit Gis)', () => {
    const e = estimateKey(hist({ 9: 5, 11: 2, 0: 3, 2: 2, 4: 4, 5: 2, 8: 2 }))!;
    expect(e.key).toEqual({ tonicPc: 9, mode: 'minor' });
  });

  it('erkennt transponierte Tonarten (Es-Dur)', () => {
    const e = estimateKey(hist({ 3: 4, 5: 2, 7: 3, 8: 2, 10: 3, 0: 2, 2: 1 }))!;
    expect(e.key).toEqual({ tonicPc: 3, mode: 'major' });
  });

  it('liefert ohne Töne nichts', () => {
    expect(estimateKey(hist({}))).toBeNull();
  });
});

describe('KeyTracker (gleitendes Fenster)', () => {
  const play = (t: KeyTracker, midis: number[], start: number, dur = 400) => {
    midis.forEach((m, i) => {
      t.noteOn(m, start + i * dur);
      t.noteOff(m, start + i * dur + dur);
    });
    return start + midis.length * dur;
  };

  it('erkennt die Tonart des zuletzt Gespielten und vergisst Altes', () => {
    const t = new KeyTracker(8000, 0.04);
    // C-Dur-Kadenz
    let now = play(t, [60, 64, 67, 65, 69, 72, 67, 71, 74, 60, 64, 67], 0);
    expect(t.estimate(now)?.key).toEqual({ tonicPc: 0, mode: 'major' });
    // 20 s später: Es-Dur
    now = play(t, [63, 67, 70, 68, 72, 75, 70, 74, 77, 63, 67, 70, 63, 70], 20_000);
    expect(t.estimate(now)?.key).toEqual({ tonicPc: 3, mode: 'major' });
  });

  it('wechselt dank Hysterese nicht bei einer einzelnen leiterfremden Note', () => {
    const t = new KeyTracker(8000, 0.04);
    const now = play(t, [60, 64, 67, 65, 69, 72, 67, 71, 74, 60, 64, 67], 0);
    expect(t.estimate(now)?.key.tonicPc).toBe(0);
    const later = play(t, [66], now);
    expect(t.estimate(later)?.key).toEqual({ tonicPc: 0, mode: 'major' });
  });

  it('zählt gehaltene Noten bis jetzt', () => {
    const t = new KeyTracker();
    t.noteOn(60, 0);
    const h = t.histogram(1000);
    expect(h[0]).toBeGreaterThan(900);
  });
});
