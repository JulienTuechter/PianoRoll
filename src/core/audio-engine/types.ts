/** Ausgabekanal: 'echo' = eigenes Spiel, 'app' = Vorspielen/Begleitung, 'metronome' = Metronom & Count-in. */
export type AudioBus = 'echo' | 'app' | 'metronome';

export interface AudioOutput {
  /** Muss nach einer Nutzergeste aufgerufen werden (Autoplay-Policy). */
  resume(): Promise<void>;
  readonly ready: boolean;
  noteOn(bus: AudioBus, midi: number, velocity: number, delaySec?: number): void;
  noteOff(bus: AudioBus, midi: number, delaySec?: number): void;
  /** Spielt eine Note mit fester Dauer (Vorspielen) */
  playNote(bus: AudioBus, midi: number, velocity: number, delaySec: number, durationSec: number): void;
  setSustain(bus: AudioBus, down: boolean): void;
  /** Metronom-Klick auf dem Metronom-Bus */
  click(accent: boolean, delaySec: number): void;
  allNotesOff(bus?: AudioBus): void;
  setVolume(bus: AudioBus, volume: number): void;
  setMuted(bus: AudioBus, muted: boolean): void;
}
