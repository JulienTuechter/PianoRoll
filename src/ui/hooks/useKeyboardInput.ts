import { useEffect } from 'react';
import { keyCodeToMidi, MAX_SIM_OCTAVE, MIN_SIM_OCTAVE } from '../../core/input/keyboard-map';
import { hub, seekMeasure, toggleLoop, toggleMetronome, togglePlay } from '../runtime';
import { isRecording, stopRecording } from '../recording';
import { useApp } from '../store/app-store';
import { useSettings } from '../store/settings';

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement)
    return !['range', 'checkbox', 'radio', 'button'].includes(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/**
 * Globale Tastatur: Shortcuts (Leertaste, Pfeile, L, Shift+M, Shift+B, -/+) und Simulator (zwei Reihen = zwei Oktaven, Shift = Pedal).
 */
export function useKeyboardInput(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const held = new Map<string, number>(); // code → midi

    const onDown = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) {
          if (isRecording()) stopRecording();
          else togglePlay();
        }
        return;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        seekMeasure(e.code === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (e.key === '-' || e.key === '+' || e.key === '=') {
        e.preventDefault();
        const s = useSettings.getState();
        const delta = e.key === '-' ? -1 : 1;
        const octave = Math.min(MAX_SIM_OCTAVE, Math.max(MIN_SIM_OCTAVE, s.simulatorOctave + delta));
        if (octave !== s.simulatorOctave) {
          releaseAll(e.timeStamp);
          s.update({ simulatorOctave: octave });
        }
        return;
      }
      if (e.code === 'KeyL' && !e.shiftKey) {
        e.preventDefault();
        if (!e.repeat) toggleLoop();
        return;
      }
      if (e.code === 'KeyM' && e.shiftKey) {
        e.preventDefault();
        if (!e.repeat) toggleMetronome();
        return;
      }
      if (e.code === 'KeyS' && e.shiftKey) {
        e.preventDefault();
        const st = useSettings.getState();
        if (!e.repeat) st.update({ sidePanelOpen: !st.sidePanelOpen });
        return;
      }
      if (e.code === 'KeyB' && e.shiftKey) {
        e.preventDefault();
        useApp.getState().set({ libraryOpen: true });
        return;
      }
      if (e.key === 'Shift') {
        if (!e.repeat) hub.emit({ type: 'sustain', down: true, timeMs: e.timeStamp, source: 'keyboard' });
        return;
      }
      const midi = keyCodeToMidi(e.code, useSettings.getState().simulatorOctave);
      if (midi === null) return;
      e.preventDefault();
      if (e.repeat || held.has(e.code)) return;
      held.set(e.code, midi);
      hub.emit({
        type: 'noteon',
        midi,
        velocity: useSettings.getState().simulatorVelocity,
        timeMs: e.timeStamp,
        source: 'keyboard',
      });
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        hub.emit({ type: 'sustain', down: false, timeMs: e.timeStamp, source: 'keyboard' });
        return;
      }
      const midi = held.get(e.code);
      if (midi === undefined) return;
      held.delete(e.code);
      if (![...held.values()].includes(midi))
        hub.emit({ type: 'noteoff', midi, timeMs: e.timeStamp, source: 'keyboard' });
    };

    const releaseAll = (t: number) => {
      held.clear();
      hub.releaseSource('keyboard', t);
    };
    const onBlur = () => releaseAll(performance.now());

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      releaseAll(performance.now());
    };
  }, [enabled]);
}
