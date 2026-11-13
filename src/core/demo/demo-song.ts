import { Midi } from '@tonejs/midi';

/**
 * Kurzes eigenes Übungsstück (beide Hände), damit die App ohne eigene Datei ausprobiert werden kann.
 * Rechte Hand: Melodie, linke Hand: Bass + Akkorde I – vi – IV – V.
 */
export function createDemoMidi(): Uint8Array {
  const midi = new Midi();
  midi.name = 'Demo - Erste Schritte'; // MIDI-Metatexte sind Bytes, daher nur ASCII
  midi.header.setTempo(84);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  const ppq = midi.header.ppq;
  const q = ppq;

  const rh = midi.addTrack();
  rh.name = 'Rechte Hand';
  const lh = midi.addTrack();
  lh.name = 'Linke Hand';

  // [midi, Viertel] – C-Dur, 8 Takte
  const melody: [number, number][] = [
    [64, 1],
    [65, 1],
    [67, 2],
    [69, 1],
    [67, 1],
    [64, 2],
    [65, 1],
    [64, 1],
    [62, 2],
    [67, 1],
    [65, 1],
    [64, 1],
    [62, 1],
    [64, 1],
    [65, 1],
    [67, 2],
    [72, 1],
    [71, 1],
    [69, 2],
    [65, 1],
    [67, 1],
    [69, 1],
    [71, 1],
    [72, 4],
  ];
  let t = 0;
  for (const [m, len] of melody) {
    rh.addNote({ midi: m, ticks: t, durationTicks: len * q - 10, velocity: 0.75 });
    t += len * q;
  }

  // Pro Takt: Bass auf 1, Akkord auf 3
  const chords: [number, number[]][] = [
    [48, [55, 60, 64]],
    [45, [52, 57, 60]],
    [41, [53, 57, 60]],
    [43, [55, 59, 62]],
    [48, [55, 60, 64]],
    [45, [52, 57, 60]],
    [41, [53, 57, 60]],
    [48, [52, 55, 60]],
  ];
  chords.forEach(([bass, chord], bar) => {
    const start = bar * 4 * q;
    lh.addNote({ midi: bass, ticks: start, durationTicks: 2 * q - 10, velocity: 0.6 });
    for (const c of chord)
      lh.addNote({ midi: c, ticks: start + 2 * q, durationTicks: 2 * q - 10, velocity: 0.5 });
  });

  return midi.toArray();
}
