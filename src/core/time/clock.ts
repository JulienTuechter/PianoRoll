/** Monotone Zeitquelle in Millisekunden. Im Browser performance.now(), in Tests eine FakeClock. */
export interface Clock {
  now(): number;
}

export const performanceClock: Clock = {
  now: () => performance.now(),
};

export class FakeClock implements Clock {
  private t: number;

  constructor(startMs = 0) {
    this.t = startMs;
  }

  now(): number {
    return this.t;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error('FakeClock kann nicht rückwärts laufen');
    this.t += ms;
  }

  set(ms: number): void {
    this.t = ms;
  }
}
