import { describe, expect, it } from 'vitest';
import type { MusicalKey } from '../key-detection/key';
import {
  alternativesFor,
  chordFromScale,
  romanFor,
  scaleChords,
  scalePcs,
  suggestNext,
  voiceChord,
} from './harmony';

const C: MusicalKey = { tonicPc: 0, mode: 'major' };
const Am: MusicalKey = { tonicPc: 9, mode: 'minor' };
const F: MusicalKey = { tonicPc: 5, mode: 'major' };

describe('Stufen', () => {
  it('ordnet Akkorde Stufen zu', () => {
    expect(romanFor({ rootPc: 9, quality: 'min' }, C)?.numeral).toBe('vi');
    expect(romanFor({ rootPc: 9, quality: 'min7' }, C)?.numeral).toBe('vi');
    expect(romanFor({ rootPc: 7, quality: 'dom7' }, C)?.numeral).toBe('V7');
    expect(romanFor({ rootPc: 7, quality: 'maj' }, C)?.numeral).toBe('V');
    expect(romanFor({ rootPc: 11, quality: 'hdim7' }, C)?.numeral).toBe('vii°');
    expect(romanFor({ rootPc: 5, quality: 'min' }, C)?.numeral).toBe('iv');
    expect(romanFor({ rootPc: 4, quality: 'dom7' }, Am)?.numeral).toBe('V7');
    expect(romanFor({ rootPc: 1, quality: 'maj' }, C)).toBeNull();
  });

  it('schreibt Akkorde aus der Tonart', () => {
    const bb = chordFromScale(
      scaleChords(F).find((s) => s.numeral === 'IV')!,
      F,
    );
    expect(bb.symbol).toBe('Bb');
    expect(bb.pcs).toEqual([10, 2, 5]);
    const gsharp = chordFromScale(
      scaleChords(Am).find((s) => s.numeral === 'vii°7')!,
      Am,
    );
    expect(gsharp.symbol).toBe('G#°7');
    expect(scalePcs(Am)).toContain(8);
  });
});

describe('Folgeakkorde', () => {
  it('G7 in C → zuerst C (Auflösung), dann Am (Trugschluss)', () => {
    const s = suggestNext({ rootPc: 7, quality: 'dom7' }, C);
    expect(s.map((x) => `${x.symbol} – ${x.numeral}`).slice(0, 2)).toEqual(['C – I', 'Am – vi']);
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.some((x) => x.rootPc === 7)).toBe(false); // weder V7 noch V
  });

  it('E7 in a-Moll → Am, dann F (Trugschluss VI)', () => {
    const s = suggestNext({ rootPc: 4, quality: 'dom7' }, Am);
    expect(s.map((x) => x.symbol).slice(0, 2)).toEqual(['Am', 'F']);
    expect(s.length).toBeGreaterThanOrEqual(4);
  });

  it('ii → Dominante', () => {
    expect(suggestNext({ rootPc: 2, quality: 'min7' }, C)[0]?.fn).toBe('dominant');
  });

  it('liefert 4–6 sortierte Vorschläge ohne den aktuellen Akkord', () => {
    const s = suggestNext({ rootPc: 0, quality: 'maj' }, C);
    expect(s.length).toBeGreaterThanOrEqual(4);
    expect(s.length).toBeLessThanOrEqual(6);
    expect(s.some((x) => x.numeral === 'I')).toBe(false);
    for (let i = 1; i < s.length; i++)
      expect(s[i - 1]!.probability).toBeGreaterThanOrEqual(s[i]!.probability);
    expect(s.reduce((a, b) => a + b.probability, 0)).toBeLessThanOrEqual(1.0001);
  });

  it('ohne bzw. mit leiterfremdem Akkord: typische Akkorde der Tonart', () => {
    expect(suggestNext(null, C)[0]?.numeral).toBe('I');
    expect(suggestNext({ rootPc: 1, quality: 'maj' }, C)[0]?.numeral).toBe('I');
  });
});

describe('Voicing für Ghost-Notes', () => {
  it('setzt den Bass in die linke Hand', () => {
    expect(voiceChord(5, [5, 9, 0]).bass).toBe(41); // F2
  });
  it('wählt die Umkehrung mit der kleinsten Bewegung', () => {
    // C (C4 E4 G4) → F: am nächsten ist F/C = C4 F4 A4
    expect(voiceChord(5, [5, 9, 0], [60, 64, 67]).upper).toEqual([60, 65, 69]);
    // C → G: B3 D4 G4
    expect(voiceChord(7, [7, 11, 2], [60, 64, 67]).upper).toEqual([59, 62, 67]);
  });
  it('bleibt ohne Referenz in der Mittellage', () => {
    const v = voiceChord(0, [0, 4, 7]).upper;
    expect(Math.min(...v)).toBeGreaterThanOrEqual(55);
    expect(Math.max(...v)).toBeLessThanOrEqual(81);
  });
});

describe('Alternativen', () => {
  it('findet Akkorde, die die Melodie abdecken', () => {
    // Töne A, C, E (Am) – auch passend: C (C, E) und F (A, C)
    const w = Array.from({ length: 12 }, () => 0);
    w[9] = 2;
    w[0] = 2;
    w[4] = 2;
    const alt = alternativesFor(w, { rootPc: 9, quality: 'min' }, C);
    const symbols = alt.map((a) => a.symbol);
    expect(symbols).toContain('C');
    expect(symbols).toContain('F');
    expect(symbols).not.toContain('Am');
    expect(alt.every((a) => a.coverage >= 0.6)).toBe(true);
  });
  it('liefert ohne Töne nichts', () => {
    expect(alternativesFor(new Array(12).fill(0), null, C)).toEqual([]);
  });
});
