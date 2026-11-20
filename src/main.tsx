import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { registerServiceWorker } from './ui/service-worker';
import '@fontsource-variable/fraunces/opsz.css';
import '@fontsource-variable/geist';
import './ui/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root fehlt');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
