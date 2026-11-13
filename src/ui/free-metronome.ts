/**
 * Metronom im freien Spiel (kein Stück geladen): klickt nach eingestelltem Tempo und Taktart.
 * Mit Stück übernimmt der Stück-Takt (runtime), während einer Aufnahme die Aufnahme selbst.
 */
import { audio } from './runtime';
import { useApp } from './store/app-store';
import { useSettings } from './store/settings';

const LOOKAHEAD_MS = 120;

/** Für eine optische Schlaganzeige: Zeitpunkt (performance.now) und Index des zuletzt gespielten Schlags */
export const freeBeat = { atMs: 0, index: -1, running: false };

export function startFreeMetronome(): () => void {
  let timer: number | null = null;
  let startMs = 0;
  let k = 0;
  let beatMs = 500;
  let numerator = 4;

  const shouldRun = () => {
    const s = useSettings.getState();
    const a = useApp.getState();
    return s.metronome && !a.song && a.recording === null;
  };

  const pump = () => {
    const now = performance.now();
    while (startMs + k * beatMs < now + LOOKAHEAD_MS) {
      const at = startMs + k * beatMs;
      if (at >= now - 5) {
        const accent = k % numerator === 0;
        audio.click(accent, (at - now) / 1000);
        const index = k;
        window.setTimeout(
          () => {
            freeBeat.atMs = performance.now();
            freeBeat.index = index % numerator;
          },
          Math.max(0, at - now),
        );
      }
      k++;
    }
  };

  const start = () => {
    const s = useSettings.getState();
    beatMs = (60000 / s.recBpm) * (4 / s.recDenominator);
    numerator = s.recNumerator;
    // Klang vorbereiten (Klick auf den Knopf ist eine Nutzergeste)
    if (!audio.ready) void audio.resume().catch(() => {});
    startMs = performance.now() + 80;
    k = 0;
    freeBeat.running = true;
    pump();
    timer = window.setInterval(pump, 25);
  };

  const stop = () => {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
    freeBeat.running = false;
    freeBeat.index = -1;
  };

  const sync = () => {
    const run = shouldRun();
    if (run && timer === null) start();
    if (!run && timer !== null) stop();
  };

  const offSettings = useSettings.subscribe((s, prev) => {
    // Tempo-/Taktartwechsel: neu im Takt beginnen
    if (
      timer !== null &&
      (s.recBpm !== prev.recBpm ||
        s.recNumerator !== prev.recNumerator ||
        s.recDenominator !== prev.recDenominator)
    ) {
      stop();
    }
    sync();
  });
  const offApp = useApp.subscribe((a, prev) => {
    if (a.song !== prev.song || a.recording !== prev.recording) sync();
  });
  sync();

  return () => {
    offSettings();
    offApp();
    stop();
  };
}
