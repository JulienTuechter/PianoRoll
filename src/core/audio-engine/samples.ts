/** Salamander-Samples liegen in /public/samples/piano, jede kleine Terz von A0 bis C8. */
const SAMPLE_PC: Record<number, string> = { 0: 'C', 3: 'Ds', 6: 'Fs', 9: 'A' };

export function sampleFileForMidi(midi: number): string | null {
  const name = SAMPLE_PC[midi % 12];
  if (!name) return null;
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}.mp3`;
}

/** Map Tone-Notenname → Dateiname, z. B. { "D#1": "Ds1.mp3" }. */
export function salamanderSampleMap(minMidi = 21, maxMidi = 108): Record<string, string> {
  const map: Record<string, string> = {};
  for (let m = minMidi; m <= maxMidi; m++) {
    const file = sampleFileForMidi(m);
    if (file) map[file.replace('.mp3', '').replace('s', '#')] = file;
  }
  return map;
}

/** Velocity 0..1 → Lautstärke; leicht gekrümmt, damit leises Spiel hörbar bleibt. */
export function velocityToGain(velocity: number): number {
  const v = Math.min(1, Math.max(0, velocity));
  return 0.08 + 0.92 * Math.pow(v, 1.6);
}
