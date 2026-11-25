import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/fraunces/opsz-italic.css';
import '@fontsource-variable/geist';
import '../landing.css';
import { App } from './App';
import { LangProvider } from './i18n';

// Die Sprache steht im vorgerenderten HTML (/ → en, /de/ → de)
const lang = document.documentElement.lang === 'de' ? 'de' : 'en';

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt');
const app = (
  <StrictMode>
    <LangProvider value={lang}>
      <App />
    </LangProvider>
  </StrictMode>
);
// Gebaut: Inhalt ist vorgerendert → hydratisieren. Ohne Vorrendern (Fallback): neu rendern.
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
