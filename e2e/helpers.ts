import { expect, type Page } from '@playwright/test';

/** App öffnen und den MIDI-Assistenten mit „ohne Piano“ schließen. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/app/');
  await page.getByRole('button', { name: 'Ohne Piano fortfahren (Simulator)' }).click();
  await expect(page.locator('dialog.onboarding')).toBeHidden();
}

/** Stück aus dem mitgelieferten Katalog öffnen (Startansicht oder Bibliotheksdialog). */
export async function openCatalogItem(page: Page, title: RegExp): Promise<void> {
  const item = page.locator('.catalog-item', { hasText: title }).first();
  if (!(await item.isVisible())) {
    await page.getByRole('button', { name: 'Bibliothek', exact: true }).click();
    await page.getByRole('tab', { name: 'Stückkatalog' }).click();
  }
  await page.locator('.catalog-item', { hasText: title }).first().click();
}
