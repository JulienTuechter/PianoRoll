/**
 * Prüft jede Datei aus public/library/catalog.json: vorhanden, ladbar, mit Noten.
 * (Vollständig prüft der Build: npm run library:check.)
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadMidiFile } from '../midi-file-loader/load';
import { buildCatalog, type LibraryCatalogEntry } from './catalog';

const LIBRARY = fileURLToPath(new URL('../../../public/library/', import.meta.url));
const entries = JSON.parse(readFileSync(`${LIBRARY}catalog.json`, 'utf8')) as LibraryCatalogEntry[];
const files = buildCatalog(entries, 'de').flatMap((g) => g.items.map((i) => i.file));

describe('Stücke der Online-Bibliothek', () => {
  it('es gibt Stücke', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s lässt sich laden', (f) => {
    const song = loadMidiFile(readFileSync(`${LIBRARY}midi/${f}`));
    expect(song.notes.length).toBeGreaterThan(0);
    expect(song.durationSec).toBeGreaterThan(0);
  });
});
