import { expect, test } from '@playwright/test';

test('Austria route loads the committed real hourly dataset', async ({ page }) => {
  await page.goto('/at');

  await expect(page).toHaveTitle(/Strompreisrechner Österreich - EEPA-AT/);
  await expect(page.getByText(/reale stündliche Preisdatensätze/)).toBeVisible();
  await expect(page.getByText('Keine Datendatei verfügbar')).toHaveCount(0);
  await expect(page.getByText(/Beispieldaten|Mock data/i)).toHaveCount(0);

  const response = await page.request.get('/api/at_electricity_prices.bin');
  expect(response.ok()).toBe(true);
  expect(Number(response.headers()['content-length'])).toBeGreaterThan(100_000);
});

test('home recommendation ignores the previously selected region', async ({ page }) => {
  await page.route('**/api/geoip', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ country_code: 'DE' }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem('eepa.selectedRegion', 'fr');
  });

  await page.goto('/');

  await expect(page.getByRole('link', { name: /Empfohlene Region öffnen: Deutschland & Luxemburg/ })).toBeVisible();
});
