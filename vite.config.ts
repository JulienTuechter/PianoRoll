/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5173 },
  // Lokale App: Hauptbundle ≈ 570 kB (Tone.js, tonal). VexFlow (inkl. eingebetteter Bravura-Schrift ≈ 720 kB)
  // wird erst beim Öffnen der Notenansicht per dynamic import geladen.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
