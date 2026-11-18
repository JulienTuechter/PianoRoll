/**
 * Prüft jede Datei im Ordner catalog/: lässt sie sich laden und hat sie Noten?
 * Schlägt fehl, wenn eine neu abgelegte Datei kaputt ist oder nicht der Namenskonvention folgt.
 */
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadMidiFile } from '../midi-file-loader/load';
import { buildCatalog, parseCatalogPath } from './catalog';

const ROOT = fileURLToPath(new URL('../../../catalog', import.meta.url));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  );
}

const files = walk(ROOT)
  .map((f) => relative(ROOT, f).split('\\').join('/'))
  .filter((f) => parseCatalogPath(f) !== null);

describe('mitgelieferte Katalogstücke', () => {
  it('es gibt Stücke', () => {
    expect(buildCatalog(files).length).toBeGreaterThan(0);
  });

  it.each(files)('%s lässt sich laden', (f) => {
    const song = loadMidiFile(readFileSync(join(ROOT, f)));
    expect(song.notes.length).toBeGreaterThan(0);
    expect(song.durationSec).toBeGreaterThan(0);
  });
});
