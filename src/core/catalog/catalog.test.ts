import { describe, expect, it } from 'vitest';
import { buildCatalog, catalogDisplayTitle, type LibraryCatalogEntry } from './catalog';

const entries: LibraryCatalogEntry[] = [
  { file: 'b.mid', title: 'Zebra', composer: 'Ludwig van Beethoven', level: 3 },
  { file: 'a.mid', title: 'Alle meine Entchen', composer: 'Volkslied', composer_en: 'Traditional', level: 1 },
  {
    file: 'c.mid',
    title: 'Ode an die Freude',
    title_en: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    level: 3,
  },
  { file: 'd.mid', title: 'Ohne Stufe', composer: 'X' },
  { file: 'e.mid', title: 'Versteckt', composer: 'X', level: 1, publish: false },
  { file: 'f.mid', title: 'TODO', composer: 'TODO', level: 1 },
];

describe('Stückkatalog (Online-Bibliothek)', () => {
  it('gruppiert nach Stufe, ohne Stufe zuletzt, alphabetisch je Stufe', () => {
    const groups = buildCatalog(entries, 'en');
    expect(groups.map((g) => g.level)).toEqual([1, 3, null]);
    expect(groups[1]!.items.map((i) => i.title)).toEqual(['Ode to Joy', 'Zebra']);
  });

  it('Titel und Komponist je Sprache, unveröffentlichte und TODO-Einträge fehlen', () => {
    expect(buildCatalog(entries, 'en')[0]!.items).toEqual([
      { file: 'a.mid', title: 'Alle meine Entchen', composer: 'Traditional', level: 1 },
    ]);
    expect(buildCatalog(entries, 'de')[0]!.items[0]!.composer).toBe('Volkslied');
  });

  it('Anzeigetitel mit Nachname', () => {
    expect(catalogDisplayTitle(buildCatalog(entries, 'de')[1]!.items[0]!)).toBe(
      'Beethoven: Ode an die Freude',
    );
  });
});
