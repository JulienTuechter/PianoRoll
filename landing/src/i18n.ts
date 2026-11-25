import { createContext, useContext } from 'react';
import type { Locale } from '../../src/i18n';
import { landingCopy, type LandingCopy } from '../../src/i18n/landing';

export { fmt } from '../../src/i18n/landing';

/**
 * Sprache der Landingpage. Sie steht pro URL fest (/ = Englisch, /de/ = Deutsch) und wird beim Build
 * mitgerendert; im Browser liest main.tsx sie aus <html lang>. Kein Umschalten, keine Browsererkennung.
 */
export type Lang = Locale;

const LangContext = createContext<Lang>('en');

export const LangProvider = LangContext.Provider;

export function useLang(): Lang {
  return useContext(LangContext);
}

export function useCopy(): LandingCopy {
  return landingCopy(useLang());
}
