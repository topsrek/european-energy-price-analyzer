import { expect, test } from '@playwright/test';

test('Austria route loads the committed real hourly dataset', async ({ page }) => {
  await page.goto('/at');

  await expect(page).toHaveTitle(/Strompreisrechner Österreich - EEPA-AT/);
  await expect(page.getByText(/Datenquelle: .*reale stündliche Preisdatensätze/)).toBeVisible();
  await expect(page.getByText('Keine Datendatei verfügbar')).toHaveCount(0);
  await expect(page.getByText(/Beispieldaten|Mock data/i)).toHaveCount(0);

  const response = await page.request.get('/at_electricity_prices.bin');
  expect(response.ok()).toBe(true);
  expect(Number(response.headers()['content-length'])).toBeGreaterThan(100_000);
});

test('home uses stored country preference before browser guessing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('eepa.selectedRegion', 'at'));

  await page.goto('/');

  await expect(page).toHaveURL(/\/at$/);
});
