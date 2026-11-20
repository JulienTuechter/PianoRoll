import { expect, test } from '@playwright/test';
import { openApp, openCatalogItem } from './helpers';

test('läuft nach dem ersten Besuch ohne Netz (App, Samples, Katalog, Notenschrift)', async ({
  page,
  context,
}) => {
  await openApp(page);
  // Service Worker installiert (Precache vollständig) und aktiv
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Einstellungen' })).toBeVisible();

  const sample = await page.evaluate(async () => {
    const res = await fetch('/samples/piano/C4.mp3');
    return { ok: res.ok, size: (await res.arrayBuffer()).byteLength };
  });
  expect(sample.ok).toBe(true);
  expect(sample.size).toBeGreaterThan(1000);

  await openCatalogItem(page, /Ode an die Freude/);
  await page.getByRole('button', { name: 'Noten', exact: true }).click();
  await expect(page.locator('.notation-svg svg')).toBeVisible({ timeout: 15_000 });
});
