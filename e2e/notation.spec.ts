import { expect, test } from '@playwright/test';
import { openApp, openCatalogItem } from './helpers';

test('setzt das Bach-Präludium mit zwei Stimmen und Akkordsymbolen', async ({ page }) => {
  await openApp(page);
  await openCatalogItem(page, /Präludium C-Dur/);
  await page.getByRole('button', { name: 'Noten', exact: true }).click();

  const svg = page.locator('.notation-svg svg');
  await expect(svg).toBeVisible({ timeout: 15_000 });
  // Akkordsymbole als Text über dem System (Takt 1: C-Dur)
  await expect(svg.locator('text', { hasText: /^C$/ }).first()).toBeAttached();
  // Zwei Stimmen im Bass: Hälse in beide Richtungen
  const stems = await svg.locator('.vf-stem').count();
  expect(stems).toBeGreaterThan(20);
  await page.locator('.notation-paper').screenshot({ path: 'test-results/notation-bach.png' });
});

test('blendet Akkordsymbole über die Einstellungen aus', async ({ page }) => {
  await openApp(page);
  await openCatalogItem(page, /Präludium C-Dur/);
  await page.getByRole('button', { name: 'Noten', exact: true }).click();
  const chord = page.locator('.notation-svg svg text', { hasText: /^C$/ }).first();
  await expect(chord).toBeAttached({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByLabel('Akkordsymbole über dem System').uncheck();
  await page.getByRole('button', { name: 'Schließen' }).last().click();
  await expect(chord).not.toBeAttached();
});
