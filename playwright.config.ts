import { defineConfig, devices } from '@playwright/test';

/**
 * E2E-Tests gegen den Produktionsbuild (`npm run build`, dann `npm run e2e`), inkl. Service Worker.
 * Lokal ohne Playwright-Browser: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/brave-browser npm run e2e
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const PORT = 4180;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'de-DE',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1400, height: 900 },
        launchOptions: {
          ...(executablePath ? { executablePath } : {}),
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
  },
});
