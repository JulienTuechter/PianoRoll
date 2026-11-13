/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Eingebettete VexFlow-Schriften (Data-URIs) für SVG/PNG-Export; die exports-Map von vexflow gibt sie nicht frei
      '@vexflow-fonts': fileURLToPath(new URL('./node_modules/vexflow/build/esm/src/fonts', import.meta.url)),
    },
  },
  server: { host: 'localhost', port: 5173 },
  // Lokale App: Hauptbundle ≈ 570 kB (Tone.js, tonal). VexFlow (inkl. eingebetteter Bravura-Schrift ≈ 720 kB)
  // wird erst beim Öffnen der Notenansicht per dynamic import geladen.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
