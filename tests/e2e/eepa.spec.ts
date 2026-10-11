import { expect, test } from '@playwright/test';

test('Austria route loads the committed real hourly dataset', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('eepa.hasSeenTour', 'true');
  });
  await page.goto('/at');

  await expect(page.getByText(/reale stündliche Preisdatensätze/)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveTitle(/Strompreisrechner Österreich - EEPA-AT/);
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

test('onboarding tour is an accessible dialog that is shown only once', async ({ page }) => {
  await page.goto('/at');

  const dialog = page.getByRole('dialog', { name: 'Willkommen bei EEPA!' });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // Focus moves into the dialog once its focus trap and Escape handler are active.
  await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByText(/reale stündliche Preisdatensätze/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('unknown routes show the not-found page', async ({ page }) => {
  await page.goto('/xyz');
  await expect(page).toHaveTitle(/Seite nicht gefunden/);
});
