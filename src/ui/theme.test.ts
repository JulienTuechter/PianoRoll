import { describe, expect, it } from 'vitest';
import { lighten, luminance } from './theme';

describe('Farbhelfer', () => {
  it('hellt Farben auf', () => {
    expect(lighten('#000000', 0.5)).toBe('#808080');
    expect(lighten('#ffffff', 0.5)).toBe('#ffffff');
    expect(lighten('ungültig', 0.5)).toBe('ungültig');
  });
  it('berechnet die Helligkeit', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#56B4E9')).toBeGreaterThan(luminance('#D55E00'));
  });
});
