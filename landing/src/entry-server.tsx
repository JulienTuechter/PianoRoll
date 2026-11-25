/** Vorrendern zur Build-Zeit (scripts/build-pages.ts) und im Dev-Server: dieselbe App wie im Browser. */
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import type { Locale } from '../../src/i18n';
import { App } from './App';
import { LangProvider } from './i18n';

export function renderBody(lang: Locale): string {
  return renderToString(
    <StrictMode>
      <LangProvider value={lang}>
        <App />
      </LangProvider>
    </StrictMode>,
  );
}
