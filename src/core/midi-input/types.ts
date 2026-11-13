/** Woher ein Input-Event stammt. */
export type InputSource = 'midi' | 'keyboard' | 'pointer' | 'mock';

export type MidiInputEvent =
  | { type: 'noteon'; midi: number; /** 0..1 */ velocity: number; timeMs: number; source: InputSource }
  | { type: 'noteoff'; midi: number; timeMs: number; source: InputSource }
  | { type: 'sustain'; down: boolean; timeMs: number; source: InputSource };

export type MidiInputListener = (event: MidiInputEvent) => void;

/** Alles, was Input-Events liefert (Hub, Mock, ...). */
export interface MidiInput {
  subscribe(listener: MidiInputListener): () => void;
}
