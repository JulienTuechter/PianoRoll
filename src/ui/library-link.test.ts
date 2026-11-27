import { describe, expect, it } from 'vitest';
import { pieceFromUrl } from './library-link';

describe('?piece= aus der Adresse', () => {
  it('nur gültige Slugs', () => {
    expect(pieceFromUrl('?piece=petzold-menuett-g-dur&lang=de')).toBe('petzold-menuett-g-dur');
    expect(pieceFromUrl('?piece=Bach-Prelude')).toBe('bach-prelude');
    expect(pieceFromUrl('?piece=../etc/passwd')).toBeNull();
    expect(pieceFromUrl('?lang=en')).toBeNull();
  });
});
