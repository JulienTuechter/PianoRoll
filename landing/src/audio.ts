import { useSyncExternalStore } from 'react';
import type { AudioOutput } from '../../src/core/audio-engine/types';

/**
 * Klang der Landingpage: dieselbe Tone.js-Engine mit Salamander-Samples wie in der App.
 * Wird erst beim ersten Tastendruck (Nutzergeste) nachgeladen; vorher bleibt die Seite stumm.
 */
type State = 'off' | 'loading' | 'on';

let state: State = 'off';
let engine: AudioOutput | null = null;
let loading: Promise<AudioOutput | null> | null = null;
/** Hat der Nutzer den Ton bewusst ausgeschaltet? Dann schaltet ein Tastendruck ihn nicht wieder ein. */
let mutedByUser = false;
const listeners = new Set<() => void>();

function emit(next: State): void {
  state = next;
  for (const fn of listeners) fn();
}

function load(): Promise<AudioOutput | null> {
  loading ??= import('../../src/core/audio-engine/tone-engine')
    .then(async ({ ToneAudioEngine }) => {
      const e = new ToneAudioEngine();
      await e.resume();
      e.setVolume('app', 0.6);
      e.setVolume('echo', 0.8);
      engine = e;
      return e;
    })
    .catch((err: unknown) => {
      console.error(err);
      loading = null;
      return null;
    });
  return loading;
}

export async function enableSound(): Promise<void> {
  mutedByUser = false;
  if (state === 'on') return;
  emit('loading');
  const e = await load();
  emit(e ? 'on' : 'off');
}

export function disableSound(): void {
  mutedByUser = true;
  engine?.allNotesOff();
  emit('off');
}

/** Erster Tastendruck auf einer Demo-Klaviatur: Ton automatisch an (außer der Nutzer hat ihn ausgeschaltet). */
export function wakeSound(): void {
  if (state === 'off' && !mutedByUser) void enableSound();
}

const live = (): AudioOutput | null => (state === 'on' ? engine : null);

export const sound = {
  /** Eigenes Spiel (gehalten) */
  on(midi: number, velocity = 0.75): void {
    live()?.noteOn('echo', midi, velocity);
  },
  off(midi: number): void {
    live()?.noteOff('echo', midi);
  },
  /** Vorspielen mit fester Dauer */
  play(midi: number, velocity = 0.6, durationSec = 0.5, delaySec = 0): void {
    live()?.playNote('app', midi, velocity, delaySec, durationSec);
  },
  click(accent: boolean, delaySec = 0): void {
    live()?.click(accent, delaySec);
  },
  stopAll(): void {
    engine?.allNotesOff();
  },
};

export function useSoundState(): State {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
    () => 'off',
  );
}
