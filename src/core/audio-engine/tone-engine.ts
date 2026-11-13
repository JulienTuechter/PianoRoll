import * as Tone from 'tone';
import { salamanderSampleMap, velocityToGain } from './samples';
import { SustainTracker } from './sustain';
import type { AudioBus, AudioOutput } from './types';

interface Voice {
  triggerAttack(note: string, time?: number, velocity?: number): unknown;
  triggerRelease(note: string, time?: number): unknown;
  releaseAll(time?: number): unknown;
}

interface Bus {
  gain: Tone.Gain;
  voice: Voice | null;
  sustain: SustainTracker;
  volume: number;
  muted: boolean;
}

const BUSES: readonly AudioBus[] = ['echo', 'app', 'metronome'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12] ?? 'C'}${Math.floor(midi / 12) - 1}`;
}

/**
 * Piano-Klang über Tone.js. Samples werden einmal dekodiert und von beiden Bussen geteilt.
 * Schlägt das Laden fehl, wird auf einen einfachen Synth zurückgefallen.
 */
export class ToneAudioEngine implements AudioOutput {
  private readonly buses = new Map<AudioBus, Bus>();
  private _ready = false;
  private clickSynth: Tone.Synth | null = null;
  private loading: Promise<void> | null = null;
  usingFallback = false;

  constructor(private readonly baseUrl = `${import.meta.env.BASE_URL}samples/piano/`) {
    // lookAhead 0: eigenes Spiel muss sofort klingen; geplante Noten bekommen explizite Zeitpunkte
    Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0 }));
    for (const b of BUSES) {
      this.buses.set(b, {
        gain: new Tone.Gain(0.8).toDestination(),
        voice: null,
        sustain: new SustainTracker(),
        volume: 0.8,
        muted: false,
      });
    }
  }

  get ready(): boolean {
    return this._ready;
  }

  async resume(): Promise<void> {
    await Tone.start();
    if (!this.clickSynth) {
      const gain = this.buses.get('metronome')?.gain;
      this.clickSynth = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
        volume: -8,
      });
      if (gain) this.clickSynth.connect(gain);
    }
    this.loading ??= this.load();
    await this.loading;
  }

  private async load(): Promise<void> {
    try {
      const map = salamanderSampleMap();
      const buffers = await new Promise<Tone.ToneAudioBuffers>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout beim Laden der Samples')), 20000);
        const b: Tone.ToneAudioBuffers = new Tone.ToneAudioBuffers({
          urls: map,
          baseUrl: this.baseUrl,
          onload: () => {
            clearTimeout(timer);
            resolve(b);
          },
          onerror: (e: Error) => {
            clearTimeout(timer);
            reject(e);
          },
        });
      });
      const urls: Record<string, Tone.ToneAudioBuffer> = {};
      for (const name of Object.keys(map)) urls[name] = buffers.get(name);
      for (const bus of this.pianoBuses()) {
        bus.voice = new Tone.Sampler({ urls, release: 1.2 }).connect(bus.gain);
      }
    } catch (err) {
      console.warn('Piano-Samples konnten nicht geladen werden, verwende Synth.', err);
      this.usingFallback = true;
      for (const bus of this.pianoBuses()) {
        const synth = new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.005, decay: 0.4, sustain: 0.25, release: 0.8 },
        });
        synth.maxPolyphony = 64;
        bus.voice = synth.connect(bus.gain);
      }
    }
    this._ready = true;
  }

  private pianoBuses(): Bus[] {
    return [...this.buses].filter(([name]) => name !== 'metronome').map(([, bus]) => bus);
  }

  private when(delaySec = 0): number {
    return Tone.now() + Math.max(0, delaySec);
  }

  noteOn(busName: AudioBus, midi: number, velocity: number, delaySec?: number): void {
    const bus = this.buses.get(busName);
    if (!bus?.voice || bus.muted) return;
    const t = this.when(delaySec);
    const name = noteName(midi);
    if (bus.sustain.noteOn(midi).retrigger) bus.voice.triggerRelease(name, t);
    bus.voice.triggerAttack(name, t, velocityToGain(velocity));
  }

  noteOff(busName: AudioBus, midi: number, delaySec?: number): void {
    const bus = this.buses.get(busName);
    if (!bus?.voice) return;
    if (bus.sustain.noteOff(midi)) bus.voice.triggerRelease(noteName(midi), this.when(delaySec));
  }

  playNote(busName: AudioBus, midi: number, velocity: number, delaySec: number, durationSec: number): void {
    const bus = this.buses.get(busName);
    if (!bus?.voice || bus.muted) return;
    const name = noteName(midi);
    const t = this.when(delaySec);
    bus.voice.triggerAttack(name, t, velocityToGain(velocity));
    bus.voice.triggerRelease(name, t + Math.max(0.05, durationSec));
  }

  click(accent: boolean, delaySec: number): void {
    const bus = this.buses.get('metronome');
    if (!this.clickSynth || !bus || bus.muted) return;
    this.clickSynth.triggerAttackRelease(accent ? 1760 : 1175, 0.03, this.when(delaySec), accent ? 1 : 0.6);
  }

  setSustain(busName: AudioBus, down: boolean): void {
    const bus = this.buses.get(busName);
    if (!bus?.voice) return;
    const t = this.when();
    for (const m of bus.sustain.setPedal(down)) bus.voice.triggerRelease(noteName(m), t);
  }

  allNotesOff(busName?: AudioBus): void {
    for (const [name, bus] of this.buses) {
      if (busName && name !== busName) continue;
      bus.sustain.reset();
      bus.voice?.releaseAll(this.when());
    }
  }

  setVolume(busName: AudioBus, volume: number): void {
    const bus = this.buses.get(busName);
    if (!bus) return;
    bus.volume = Math.min(1, Math.max(0, volume));
    bus.gain.gain.rampTo(bus.muted ? 0 : bus.volume, 0.05);
  }

  setMuted(busName: AudioBus, muted: boolean): void {
    const bus = this.buses.get(busName);
    if (!bus) return;
    bus.muted = muted;
    if (muted) this.allNotesOff(busName);
    bus.gain.gain.rampTo(muted ? 0 : bus.volume, 0.05);
  }
}
