import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeMidi, keyName, parseKeyText } from './analyze';
import { entryProblems } from './catalog';
import { rollPng, rollSvg } from './roll';
import { assignSlugs, flattenRedirects, pieceSlugBase, redirectProblems, slugify } from './slug';
import { cutAtWord, fitDescription, fittingTitles, markdown, wordCount } from './text';

describe('Slugs', () => {
  it('ASCII aus Komponist + Titel', () => {
    expect(pieceSlugBase('Wolfgang Amadeus Mozart', 'Die Zauberflöte')).toBe('mozart-die-zauberfloete');
    expect(slugify('Präludium C-Dur BWV 846 (Takte 1–19)')).toBe('praeludium-c-dur-bwv-846-takte-1-19');
    expect(slugify('Gymnopédie No. 1 — Érik Satie')).toBe('gymnopedie-no-1-erik-satie');
    expect(slugify('a'.repeat(30) + ' ' + 'b'.repeat(40)).length).toBeLessThanOrEqual(60);
  });

  it('bestehende Slugs bleiben, neue weichen Kollisionen und alten Slugs aus', () => {
    const items = [
      { file: 'a.mid', composer: 'Bach', title: 'Neuer Titel' },
      { file: 'b.mid', composer: 'Bach', title: 'Menuett' },
      { file: 'c.mid', composer: 'J. S. Bach', title: 'Menuett' },
    ];
    const { slugs, created } = assignSlugs(items, { 'a.mid': 'bach-alter-titel' }, { 'bach-menuett': 'x' });
    expect(slugs['a.mid']).toBe('bach-alter-titel');
    expect(slugs['b.mid']).toBe('bach-menuett-2');
    expect(slugs['c.mid']).toBe('bach-menuett-3');
    expect(created).toEqual(['b.mid', 'c.mid']);
  });

  it('Weiterleitungen: Schleifen, fehlende Ziele, Ketten', () => {
    const active = new Set(['c']);
    expect(redirectProblems({ a: 'b', b: 'c' }, active)).toEqual([]);
    expect(redirectProblems({ a: 'b', b: 'a' }, active).join()).toMatch(/schleife/);
    expect(redirectProblems({ a: 'zzz' }, active).join()).toMatch(/kein veröffentlichtes Stück/);
    expect(redirectProblems({ c: 'a' }, new Set(['a', 'c'])).join()).toMatch(/wieder einem Stück/);
    expect(flattenRedirects({ a: 'b', b: 'c' })).toEqual({ a: 'c', b: 'c' });
  });
});

describe('Katalogeintrag', () => {
  const ok = { file: 'x.mid', title: 'T', composer: 'C', license: 'Public Domain', credit: 'Quelle' };
  it('Pflichtfelder, TODO, Lizenzklasse', () => {
    expect(entryProblems(ok).errors).toEqual([]);
    expect(entryProblems({ ...ok, credit: undefined }).errors.join()).toMatch(/license_url.*credit/);
    expect(entryProblems({ ...ok, title: 'TODO' }).errors.join()).toMatch(/TODO/);
    expect(entryProblems({ ...ok, license_class: 'nc' }).errors.join()).toMatch(/nicht freigegeben/);
    expect(entryProblems({ ...ok, license_class: 'free' }).errors).toEqual([]);
    // publish: false → keine Seite, daher auch keine TODO-Sperre
    expect(entryProblems({ ...ok, title: 'TODO', publish: false }).errors).toEqual([]);
  });
});

describe('Titel und Description', () => {
  it('erster Kandidat, der in 60 Zeichen passt; nie mitten im Wort gekürzt', () => {
    expect(fittingTitles(['x'.repeat(61), 'Kurz | Pianist'])[0]).toBe('Kurz | Pianist');
    const cut = fittingTitles(['Ein sehr langer Titel '.repeat(5)])[0]!;
    expect(cut.length).toBeLessThanOrEqual(60);
    expect(cut).toMatch(/Titel…$|Ein…$|langer…$|sehr…$/);
    expect(cutAtWord('Hallo schöne Welt', 12)).toBe('Hallo…');
  });

  it('Description füllt bis 120–160 Zeichen auf', () => {
    const d = fitDescription([
      'a'.repeat(80) + '.',
      'b'.repeat(30) + '.',
      'c'.repeat(100) + '.',
      'd'.repeat(20) + '.',
    ]);
    expect(d.length).toBeGreaterThanOrEqual(120);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).not.toContain('ccc');
  });

  it('Wörter und Markdown', () => {
    expect(wordCount('Ein Satz – mit 3 Wörtern.')).toBe(5);
    expect(markdown('## Titel\n\nText mit **fett** und [Link](/de/).\n\n- a\n- b')).toBe(
      '<h2>Titel</h2>\n<p>Text mit <strong>fett</strong> und <a href="/de/">Link</a>.</p>\n<ul><li>a</li><li>b</li></ul>',
    );
    expect(markdown('<script>x</script> [x](javascript:alert(1))')).not.toMatch(/<script|javascript:/);
  });
});

describe('MIDI-Analyse und Bilder', () => {
  const bytes = new Uint8Array(
    readFileSync(new URL('../../catalog/03 Mittel/Beethoven - Für Elise (Anfang).mid', import.meta.url)),
  );

  it('Eckdaten aus der Datei', () => {
    const { stats, roll } = analyzeMidi(bytes);
    expect(stats.notes).toBe(roll.length);
    expect(stats.notes).toBeGreaterThan(50);
    expect(stats.timeSignature).toBe('3/8');
    expect(stats.durationSec).toBeGreaterThan(10);
    expect(stats.lowest).toBeLessThan(stats.highest);
    expect(stats.key && keyName(stats.key, 'de')).toBe('a-Moll');
  });

  it('Tonarten lesen und benennen', () => {
    expect(parseKeyText('Bb major')).toEqual({ tonicPc: 10, mode: 'major' });
    expect(parseKeyText('fis-Moll')).toEqual({ tonicPc: 6, mode: 'minor' });
    expect(parseKeyText('H-Dur')).toEqual({ tonicPc: 11, mode: 'major' });
    expect(keyName({ tonicPc: 3, mode: 'major' }, 'de')).toBe('Es-Dur');
    expect(keyName({ tonicPc: 10, mode: 'major' }, 'de')).toBe('B-Dur');
    expect(keyName({ tonicPc: 10, mode: 'major' }, 'en')).toBe('B♭ major');
  });

  it('SVG und PNG (1200×630, gültige Signatur)', () => {
    const { roll } = analyzeMidi(bytes);
    expect(rollSvg(roll, 'A & B')).toMatch(/^<svg[\s\S]*<title>A &amp; B<\/title>[\s\S]*<rect/);
    const png = rollPng(roll);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});
