import { describe, expect, it } from 'vitest';
import { buildCatalog, catalogDisplayTitle, parseCatalogPath } from './catalog';

describe('Stückkatalog', () => {
  it('liest Kategorie, Komponist und Titel aus dem Pfad', () => {
    expect(parseCatalogPath('01 Einstieg/Volkslied - Alle meine Entchen.mid')).toMatchObject({
      category: 'Einstieg',
      composer: 'Volkslied',
      title: 'Alle meine Entchen',
    });
    expect(parseCatalogPath('Klassik/02_J. S. Bach – Präludium C-Dur.MIDI')).toMatchObject({
      category: 'Klassik',
      composer: 'J. S. Bach',
      title: 'Präludium C-Dur',
    });
    expect(parseCatalogPath('Ohne Komponist.mid')).toMatchObject({ category: '', composer: null });
    expect(parseCatalogPath('README.md')).toBeNull();
  });

  it('gruppiert und sortiert numerisch', () => {
    const groups = buildCatalog(['10 Mittel/b.mid', '2 Leicht/z.mid', '2 Leicht/a.mid', 'notiz.txt']);
    expect(groups.map((g) => g.category)).toEqual(['Leicht', 'Mittel']);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(['a', 'z']);
  });

  it('Anzeigetitel', () => {
    expect(catalogDisplayTitle(parseCatalogPath('x/Beethoven - Ode.mid')!)).toBe('Beethoven: Ode');
  });
});
