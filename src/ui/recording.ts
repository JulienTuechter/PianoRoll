/**
 * Aufnahme: Count-in und Metronom nach eingestelltem Tempo, dann zeichnet der Recorder alle Anschläge auf.
 * Danach öffnet sich der Editor (Quantisierung, Notenvorschau, Export, Speichern).
 */
import { Recorder } from '../core/recorder/recorder';
import { freeTrail } from './harmony-service';
import { audio, hub, transport, unloadSong } from './runtime';
import { useApp } from './store/app-store';
import { useSettings } from './store/settings';

/** Für die Anzeige pro Frame (ohne React-Rerender) */
export const recLive = {
  countInStart: 0,
  t0: 0,
  beatMs: 500,
  countInBeats: 4,
  numerator: 4,
  recorder: null as Recorder | null,
};

let offHub: (() => void) | null = null;
let timer: number | null = null;

const LOOKAHEAD_MS = 120;

export function isRecording(): boolean {
  return recLive.recorder !== null;
}

let preparing = false;

/**
 * Startet die Aufnahme. Ist der Klavierklang noch nicht geladen (erster Klick in der App), wird erst geladen –
 * sonst blockiert das Dekodieren der Samples den Hauptthread während des Count-ins (stotternde Klicks).
 */
export async function startRecording(): Promise<void> {
  if (recLive.recorder || preparing) return;
  if (!audio.ready) {
    preparing = true;
    try {
      await audio.resume();
    } finally {
      preparing = false;
    }
  }
  beginRecording();
}

function beginRecording(): void {
  if (recLive.recorder) return;
  const s = useSettings.getState();
  if (useApp.getState().song) unloadSong();
  if (transport.state === 'playing') transport.pause();
  freeTrail.clear();

  const beatMs = (60000 / s.recBpm) * (4 / s.recDenominator);
  const countInBeats = Math.max(1, s.countInBars) * s.recNumerator;
  const countInStart = performance.now() + 150;
  const t0 = countInStart + countInBeats * beatMs;
  Object.assign(recLive, { countInStart, t0, beatMs, countInBeats, numerator: s.recNumerator });
  const recorder = new Recorder(t0, s.recBpm, s.recNumerator, s.recDenominator);
  recLive.recorder = recorder;
  offHub = hub.subscribe((e) => recorder.handle(e));

  // Klicks mit Vorlauf planen (Count-in immer, danach je nach Einstellung)
  let k = 0;
  const pump = () => {
    const now = performance.now();
    while (countInStart + k * beatMs < now + LOOKAHEAD_MS) {
      const at = countInStart + k * beatMs;
      if (at >= now - 5 && (k < countInBeats || useSettings.getState().recMetronome)) {
        audio.click(k % recLive.numerator === 0, (at - now) / 1000);
      }
      k++;
    }
    const phase = now >= t0 ? 'recording' : 'countin';
    if (useApp.getState().recording !== phase) useApp.getState().set({ recording: phase });
  };
  pump();
  timer = window.setInterval(pump, 25);
  useApp.getState().set({ recording: 'countin', freePlay: true, take: null });
}

export function stopRecording(): void {
  const recorder = recLive.recorder;
  if (!recorder) return;
  offHub?.();
  offHub = null;
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  recLive.recorder = null;
  const take = recorder.stop(performance.now());
  const hasNotes = take.notes.some((n) => n.startMs > -recLive.beatMs / 2);
  useApp.getState().set({
    recording: null,
    take: hasNotes ? take : null,
    error: hasNotes ? null : 'Keine Noten aufgenommen – die Aufnahme wurde verworfen.',
  });
}

export function toggleRecording(): void {
  if (recLive.recorder) stopRecording();
  else void startRecording();
}

export function discardTake(): void {
  useApp.getState().set({ take: null });
}
