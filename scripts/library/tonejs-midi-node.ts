/**
 * @tonejs/midi ist CommonJS ohne benannte ESM-Exporte. Im Browser und im Vite-SSR wandelt Vite es um; die
 * Bibliotheks-Skripte laufen direkt unter Node (tsx) und lenken den Import über scripts/library/tsconfig.json
 * (paths) hierher.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mod = require('../../node_modules/@tonejs/midi/build/Midi.js') as typeof import('@tonejs/midi');

export const Midi = mod.Midi;
export type Midi = import('@tonejs/midi').Midi;
