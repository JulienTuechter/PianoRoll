import { useRef } from 'react';
import { hitTestKey } from '../canvas/keyboard-layout';
import { layoutForWidth } from '../canvas/layout-cache';
import { hub } from '../runtime';
import { useT } from '../i18n';

/**
 * Eingabefläche über der Klaviatur: Maus/Touch als Simulator (gezeichnet wird die Klaviatur von der Bühne).
 */
export function PianoKeyboard() {
  const t = useT();
  const pointerNotes = useRef(new Map<number, number>()); // pointerId → midi

  const midiAt = (e: React.PointerEvent<HTMLDivElement>): { midi: number | null; velocity: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = hitTestKey(layoutForWidth(rect.width), x, y, rect.height);
    // weiter unten angeschlagen = lauter
    return { midi, velocity: Math.min(1, 0.35 + 0.65 * (y / rect.height)) };
  };

  const press = (pointerId: number, midi: number, velocity: number, timeMs: number) => {
    pointerNotes.current.set(pointerId, midi);
    hub.emit({ type: 'noteon', midi, velocity, timeMs, source: 'pointer' });
  };
  const release = (pointerId: number, timeMs: number) => {
    const midi = pointerNotes.current.get(pointerId);
    if (midi === undefined) return;
    pointerNotes.current.delete(pointerId);
    // Andere Pointer könnten dieselbe Taste halten
    if (![...pointerNotes.current.values()].includes(midi))
      hub.emit({ type: 'noteoff', midi, timeMs, source: 'pointer' });
  };

  return (
    <div
      className="keyboard-input"
      role="group"
      aria-label={t.stage.keyboard}
      onPointerDown={(e) => {
        const { midi, velocity } = midiAt(e);
        if (midi === null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press(e.pointerId, midi, velocity, e.timeStamp);
      }}
      onPointerMove={(e) => {
        if (!pointerNotes.current.has(e.pointerId)) return;
        const { midi, velocity } = midiAt(e);
        const current = pointerNotes.current.get(e.pointerId);
        if (midi === null || midi === current) return;
        release(e.pointerId, e.timeStamp); // Glissando
        press(e.pointerId, midi, velocity, e.timeStamp);
      }}
      onPointerUp={(e) => release(e.pointerId, e.timeStamp)}
      onPointerCancel={(e) => release(e.pointerId, e.timeStamp)}
    />
  );
}
