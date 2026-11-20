import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('misst die Latenz aus Anschlägen im Takt und übernimmt den Wert', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('button', { name: 'Latenz messen' }).click();
  await expect(page.getByText(/Einzählen/)).toBeVisible();

  // Sobald der Messteil beginnt: 16 Anschläge (Leertaste), jeweils 50 ms nach dem Klick (100 BPM = 600 ms)
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const begin = () => {
          const t0 = performance.now();
          for (let k = 0; k < 16; k++)
            setTimeout(
              () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })),
              t0 + k * 600 + 50 - performance.now(),
            );
          setTimeout(resolve, 16 * 600);
        };
        const poll = () =>
          document.body.textContent?.includes('Spiel auf jeden Klick') ? begin() : setTimeout(poll, 5);
        poll();
      }),
  );

  const apply = page.getByRole('button', { name: /ms übernehmen/ });
  await expect(apply).toBeVisible({ timeout: 5_000 });
  const ms = Number((await apply.textContent())?.match(/(\d+) ms/)?.[1]);
  // Erkennung des Messbeginns ist auf ±25 ms genau
  expect(ms).toBeGreaterThanOrEqual(25);
  expect(ms).toBeLessThanOrEqual(90);
  await apply.click();
  await expect(page.getByText(`Latenzausgleich: ${ms} ms`)).toBeVisible();
});
