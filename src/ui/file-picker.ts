import { loadFile } from './runtime';

/** Öffnet den Dateidialog für MIDI-Dateien (ohne verstecktes Input im JSX). */
export function pickMidiFile(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mid,.midi,audio/midi,audio/x-midi';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) void loadFile(f);
  };
  input.click();
}
