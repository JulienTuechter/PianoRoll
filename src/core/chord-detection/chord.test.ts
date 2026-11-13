import { describe, expect, it } from 'vitest';
import { pcName } from '../key-detection/key';
import { describeChord, detectChord, respell } from './chord';

const sharps = (p: number) => pcName(p, false);
const flats = (p: number) => pcName(p, true);
const sym = (midis: number[], spell = sharps) => detectChord(midis, spell)?.symbol ?? null;

describe('Akkorderkennung', () => {
  it('erkennt Dreiklänge in Grundstellung', () => {
    expect(sym([60, 64, 67])).toBe('C');
    expect(sym([57, 60, 64])).toBe('Am');
    expect(sym([59, 62, 65])).toBe('B°');
    expect(sym([60, 64, 68])).toBe('C+');
  });

  it('erkennt Umkehrungen als Slash-Akkorde', () => {
    const c = detectChord([52, 55, 60], sharps)!;
    expect(c.symbol).toBe('C/E');
    expect(c.inversion).toBe(1);
    expect(detectChord([55, 60, 64], sharps)!.inversion).toBe(2);
    expect(describeChord(c)).toBe('Dur-Dreiklang, 1. Umkehrung');
  });

  it('bevorzugt gebräuchliche Deutungen bei mehrdeutigen Tönen', () => {
    expect(sym([52, 57, 60, 67])).toBe('Am7/E'); // statt C6/E
    expect(sym([60, 64, 67, 69])).toBe('C6'); // Bass C → C6 statt Am7/C
    expect(sym([64, 67, 72])).toBe('C/E'); // statt Em#5
  });

  it('erkennt Septakkorde und Vorhalte', () => {
    expect(sym([55, 59, 62, 65])).toBe('G7');
    expect(sym([60, 64, 67, 71])).toBe('Cmaj7');
    expect(sym([59, 62, 65, 69])).toBe('Bm7♭5');
    expect(sym([59, 62, 65, 68])).toBe('B°7');
    expect(sym([60, 65, 67])).toBe('Csus4');
  });

  it('ignoriert Oktavverdopplungen und braucht drei Tonhöhenklassen', () => {
    expect(sym([48, 60, 64, 67, 72])).toBe('C');
    expect(sym([60, 64])).toBeNull();
    expect(sym([60, 72, 84])).toBeNull();
    expect(sym([])).toBeNull();
  });

  it('schreibt passend zur Tonart', () => {
    expect(sym([61, 65, 68], flats)).toBe('Db');
    expect(sym([61, 65, 68], sharps)).toBe('C#');
    expect(sym([58, 62, 65], flats)).toBe('Bb');
  });
});

describe('Umbenennen', () => {
  it('schreibt einen Akkord für eine andere Tonart neu', () => {
    const c = detectChord([61, 65, 68, 73], sharps)!;
    expect(c.symbol).toBe('C#');
    expect(respell(c, flats).symbol).toBe('Db');
    const inv = detectChord([53, 61, 68], sharps)!;
    expect(respell(inv, flats).symbol).toBe('Db/F');
  });
});
