import type { Clock } from '../time/clock';
import type { InputHub } from './input-hub';

/** Komfort-Wrapper für Tests: spielt Tasten über einen InputHub mit (Fake-)Zeit. */
export class MockMidiInput {
  constructor(
    private readonly hub: InputHub,
    private readonly clock: Clock,
  ) {}

  press(midi: number, velocity = 0.8): void {
    this.hub.emit({ type: 'noteon', midi, velocity, timeMs: this.clock.now(), source: 'mock' });
  }

  release(midi: number): void {
    this.hub.emit({ type: 'noteoff', midi, timeMs: this.clock.now(), source: 'mock' });
  }

  chord(midis: readonly number[], velocity = 0.8): void {
    for (const m of midis) this.press(m, velocity);
  }

  releaseAll(): void {
    this.hub.releaseSource('mock', this.clock.now());
  }

  pedal(down: boolean): void {
    this.hub.emit({ type: 'sustain', down, timeMs: this.clock.now(), source: 'mock' });
  }
}
