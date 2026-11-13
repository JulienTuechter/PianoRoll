import { describe, expect, it } from 'vitest';
import { computeKeyboardLayout, hitTestKey } from './keyboard-layout';

describe('Klaviatur-Geometrie', () => {
  const layout = computeKeyboardLayout(520); // 52 weiße Tasten à 10 px

  it('hat 88 Tasten, davon 52 weiß', () => {
    expect(layout.keys).toHaveLength(88);
    expect(layout.whites).toHaveLength(52);
    expect(layout.whiteWidth).toBe(10);
  });

  it('beginnt bei A0 und endet bei C8', () => {
    expect(layout.byMidi[21]?.x).toBe(0);
    expect(layout.byMidi[108]?.x).toBe(510);
  });

  it('setzt schwarze Tasten auf die Fuge', () => {
    const asharp0 = layout.byMidi[22]!;
    expect(asharp0.black).toBe(true);
    expect(asharp0.x + asharp0.w / 2).toBeCloseTo(10 + 1); // Fuge A0|B0 + Versatz 0,1
  });

  it('trifft oben schwarze und unten weiße Tasten', () => {
    const cs4 = layout.byMidi[61]!;
    const cx = cs4.x + cs4.w / 2;
    expect(hitTestKey(layout, cx, 10, 100)).toBe(61);
    expect(hitTestKey(layout, cx, 90, 100)).toBe(cx < layout.byMidi[62]!.x ? 60 : 62);
    expect(hitTestKey(layout, -1, 10, 100)).toBeNull();
  });
});
