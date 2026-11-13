/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: 'localhost', port: 5173 },
  // Lokale App, ein Bundle (Tone.js ≈ 300 kB). VexFlow wird in Phase 5 per dynamic import nachgeladen.
  build: { chunkSizeWarningLimit: 700 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
