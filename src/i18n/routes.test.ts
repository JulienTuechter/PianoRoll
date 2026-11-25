import { afterEach, describe, expect, it, vi } from 'vitest';
import { alternates, appPath, localeFromPath, localizedPath } from './routes';
import { fmt, landingCopy } from './landing';
import { detectLocale } from '.';

describe('localizedPath', () => {
  it('Englisch ohne Präfix, Deutsch unter /de/', () => {
    expect(localizedPath('home', 'en')).toBe('/');
    expect(localizedPath('home', 'de')).toBe('/de/');
    expect(localizedPath('library', 'de')).toBe('/de/bibliothek/');
    expect(localizedPath('composer', 'en', { composer: 'bach' })).toBe('/library/composer/bach/');
    expect(localizedPath('composer', 'de', { composer: 'J. S. Bach' })).toBe(
      '/de/bibliothek/komponist/J.%20S.%20Bach/',
    );
  });

  it('fehlender Parameter ist ein Fehler', () => {
    expect(() => localizedPath('composer', 'de')).toThrow(/composer/);
  });

  it('hreflang-Alternativen mit x-default = Englisch', () => {
    expect(alternates('home')).toEqual([
      { hreflang: 'en', path: '/' },
      { hreflang: 'de', path: '/de/' },
      { hreflang: 'x-default', path: '/' },
    ]);
  });

  it('Sprache aus Pfad und App-Link', () => {
    expect(localeFromPath('/de/')).toBe('de');
    expect(localeFromPath('/')).toBe('en');
    expect(localeFromPath('/demo/')).toBe('en');
    expect(appPath('de')).toBe('/app/?lang=de');
  });
});

describe('Landing-Texte', () => {
  it('Platzhalter', () => {
    expect(fmt(landingCopy('de').notation.bar, { n: 2, of: 8 })).toBe('Takt 2 von 8');
    expect(fmt('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});

describe('App-Sprache aus ?lang', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('?lang geht vor der Browsersprache', () => {
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    vi.stubGlobal('location', { search: '?lang=de' });
    expect(detectLocale()).toBe('de');
    vi.stubGlobal('location', { search: '?lang=fr' });
    expect(detectLocale()).toBe('en');
  });
});
