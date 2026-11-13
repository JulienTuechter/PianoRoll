import type { InputSource, MidiInput, MidiInputEvent, MidiInputListener } from './types';

export interface PressedKey {
  velocity: number;
  timeMs: number;
}

/**
 * Führt mehrere Quellen (MIDI-Gerät, Computertastatur, Maus) zusammen und hält den aktuellen Tastenzustand.
 * Wird eine Taste von zwei Quellen gleichzeitig gehalten, gibt es nur ein noteon und ein noteoff.
 * Der Zustand ist absichtlich veränderlich, damit Canvas-Renderer ihn pro Frame ohne Kopien lesen können.
 */
export class InputHub implements MidiInput {
  private readonly listeners = new Set<MidiInputListener>();
  private readonly holders = new Map<number, Set<InputSource>>();
  private readonly sustainHolders = new Set<InputSource>();
  /** Aktuell physisch gehaltene Tasten */
  readonly pressed = new Map<number, PressedKey>();
  /** Tasten, die losgelassen wurden, aber per Pedal weiterklingen */
  readonly sustained = new Set<number>();

  get sustainDown(): boolean {
    return this.sustainHolders.size > 0;
  }

  subscribe(listener: MidiInputListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: MidiInputEvent): void {
    switch (event.type) {
      case 'noteon': {
        let set = this.holders.get(event.midi);
        if (!set) {
          set = new Set();
          this.holders.set(event.midi, set);
        }
        const first = set.size === 0;
        set.add(event.source);
        if (!first) return;
        this.pressed.set(event.midi, { velocity: event.velocity, timeMs: event.timeMs });
        this.sustained.delete(event.midi);
        break;
      }
      case 'noteoff': {
        const set = this.holders.get(event.midi);
        if (!set?.has(event.source)) return;
        set.delete(event.source);
        if (set.size > 0) return;
        this.pressed.delete(event.midi);
        if (this.sustainDown) this.sustained.add(event.midi);
        break;
      }
      case 'sustain': {
        const was = this.sustainDown;
        if (event.down) this.sustainHolders.add(event.source);
        else this.sustainHolders.delete(event.source);
        if (was === this.sustainDown) return;
        if (!this.sustainDown) this.sustained.clear();
        event = { ...event, down: this.sustainDown };
        break;
      }
    }
    for (const l of this.listeners) l(event);
  }

  /** Lässt alle Tasten/Pedale einer Quelle los, z. B. wenn das Gerät getrennt wird oder das Fenster den Fokus verliert. */
  releaseSource(source: InputSource, timeMs: number): void {
    for (const [midi, set] of this.holders) {
      if (set.has(source)) this.emit({ type: 'noteoff', midi, timeMs, source });
    }
    if (this.sustainHolders.has(source)) this.emit({ type: 'sustain', down: false, timeMs, source });
  }

  isSounding(midi: number): boolean {
    return this.pressed.has(midi) || this.sustained.has(midi);
  }
}
