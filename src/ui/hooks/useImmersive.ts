import { useEffect, useState } from 'react';
import { useApp } from '../store/app-store';

/** So lange ohne Mausbewegung, bis die Bedienelemente beim Spielen ausblenden */
const IDLE_MS = 1800;

/**
 * Spielmodus: Läuft das Stück (oder eine Aufnahme) und ruht die Maus, blenden Kopfleiste, Taktleiste und
 * Seitenleiste aus. Jede Mausbewegung, ein Klick oder Fokus per Tastatur holt sie zurück.
 * Tastendrücke zählen nicht: die Computertastatur ist der Simulator.
 */
export function useImmersive(): boolean {
  const playing = useApp((s) => s.transport === 'playing' || s.recording !== null);
  const dialogOpen = useApp((s) => s.settingsOpen || s.libraryOpen || s.resultsOpen || s.take !== null);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!playing || dialogOpen) return;
    let timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), IDLE_MS);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('focusin', wake);
    return () => {
      // Beim Stoppen, Pausieren oder Öffnen eines Dialogs sofort wieder alles zeigen
      setIdle(false);
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('focusin', wake);
    };
  }, [playing, dialogOpen]);

  return playing && !dialogOpen && idle;
}
