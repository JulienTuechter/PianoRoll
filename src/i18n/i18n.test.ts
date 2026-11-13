import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectChord } from '../core/chord-detection/chord';
import { speller } from '../core/key-detection/key';
import { MidiFileError, loadMidiFile } from '../core/midi-file-loader/load';
import { detectLocale, getLocale, messagesFor, resolveLocale, setLocale, subscribeLocale, t } from '.';
import { chordDescription, keyName, keySignatureName } from './music';

/** Alle Schlüsselpfade eines Katalogs (Funktionen gelten als Blatt). */
function paths(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? paths(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('Kataloge', () => {
  it('Englisch hat genau dieselben Schlüssel wie Deutsch', () => {
    expect(paths(messagesFor('en')).sort()).toEqual(paths(messagesFor('de')).sort());
  });

  it('enthält keine leeren Texte', () => {
    for (const locale of ['de', 'en'] as const) {
      const m = messagesFor(locale) as unknown as Record<string, unknown>;
      for (const p of paths(m)) {
        const v = p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], m);
        if (typeof v === 'string') expect(v.trim(), `${locale}: ${p}`).not.toBe('');
      }
    }
  });

  it('formatiert Werte je Sprache', () => {
    expect(messagesFor('de').pct(80)).toBe('80 %');
    expect(messagesFor('en').pct(80)).toBe('80%');
    expect(messagesFor('de').common.bars(1)).toBe('1 Takt');
    expect(messagesFor('en').common.bars(2)).toBe('2 bars');
    expect(messagesFor('de').common.seconds(3)).toBe('3,0 s');
    expect(messagesFor('en').common.seconds(3)).toBe('3.0 s');
  });
});

describe('Sprachwahl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setLocale('de');
  });

  it('erkennt die Browsersprache', () => {
    vi.stubGlobal('navigator', { languages: ['de-AT', 'en'], language: 'de-AT' });
    expect(detectLocale()).toBe('de');
    vi.stubGlobal('navigator', { languages: ['fr-FR', 'en-US'], language: 'fr-FR' });
    expect(detectLocale()).toBe('en');
    vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' });
    expect(detectLocale()).toBe('en');
  });

  it('„auto“ folgt dem Browser, feste Wahl gewinnt', () => {
    vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });
    expect(resolveLocale('auto')).toBe('en');
    expect(resolveLocale('de')).toBe('de');
  });

  it('meldet Wechsel und liefert die passenden Texte', () => {
    setLocale('de');
    const fn = vi.fn();
    const off = subscribeLocale(fn);
    setLocale('en');
    setLocale('en');
    off();
    setLocale('de');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getLocale()).toBe('de');
    expect(t().common.close).toBe('Schließen');
  });
});

describe('Musikbegriffe', () => {
  it('benennt Tonarten', () => {
    const de = messagesFor('de');
    const en = messagesFor('en');
    expect(keyName({ tonicPc: 9, mode: 'minor' }, de)).toBe('a-Moll');
    expect(keyName({ tonicPc: 10, mode: 'major' }, de)).toBe('B♭-Dur');
    expect(keyName({ tonicPc: 9, mode: 'minor' }, en)).toBe('A minor');
    expect(keyName({ tonicPc: 6, mode: 'minor' }, en)).toBe('F♯ minor');
    expect(keySignatureName('Eb', false, en)).toBe('E♭ major');
  });

  it('beschreibt Akkorde', () => {
    const c = detectChord([52, 55, 60], speller(null));
    expect(c).not.toBeNull();
    if (!c) return;
    expect(chordDescription(c, messagesFor('de'))).toBe('Dur-Dreiklang, 1. Umkehrung');
    expect(chordDescription(c, messagesFor('en'))).toBe('Major triad, 1st inversion');
  });
});

describe('Ladefehler', () => {
  it('kommen mit sprachneutralem Code aus dem Kern', () => {
    try {
      loadMidiFile(new Uint8Array([1, 2, 3]));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(MidiFileError);
      expect((err as MidiFileError).code).toBe('invalid');
    }
  });
});
