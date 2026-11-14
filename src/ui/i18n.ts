import { useEffect, useSyncExternalStore } from 'react';
import { getLocale, messagesFor, resolveLocale, setLocale, subscribeLocale, type Messages } from '../i18n';
import { useSettings } from './store/settings';

/** Texte der aktuellen Sprache; die Komponente rendert neu, wenn die Sprache wechselt. */
export function useT(): Messages {
  const locale = useSyncExternalStore(subscribeLocale, getLocale);
  return messagesFor(locale);
}

/** Hält die Sprache synchron mit der Einstellung (einmal in App einbinden). */
export function useLocaleSync(): void {
  const pref = useSettings((s) => s.locale);
  useEffect(() => {
    setLocale(resolveLocale(pref));
    if (pref !== 'auto') return;
    // „Automatisch“ folgt auch einem Wechsel der Browsersprache
    const onChange = () => setLocale(resolveLocale('auto'));
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, [pref]);
}
