import { expect, test, type Page } from '@playwright/test';

const readPriceList = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem('eepa.hasSeenTour', 'true');
  });

  await page.goto('/at?start=2026-09-01&end=2026-09-07');
  // Routes are lazy-loaded; the dev server transforms them on first request.
  await expect(page.getByRole('button', { name: '01.09.2026 - 07.09.2026' })).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/start=2026-09-01&end=2026-09-07/);

  await page.getByRole('button', { name: 'Preisliste' }).click({ timeout: 30_000 });
  const rows = page.getByRole('dialog').locator('tbody tr');
  await expect(rows).toHaveCount(7 * 24);
  return rows.evaluateAll((elements) =>
    elements.map((row) => Array.from(row.querySelectorAll('td'), (cell) => cell.textContent ?? ''))
  );
};

test.use({ timezoneId: 'America/New_York' });

test('date range and price list use market time regardless of the viewer time zone', async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);

  const newYork = await readPriceList(page);
  expect(newYork[0][0]).toBe('01.09.2026 00:00');
  expect(newYork[newYork.length - 1][0]).toBe('07.09.2026 23:00');

  // Same market hours *and* prices as a viewer in Vienna (old local-time logic shifted them by 6h).
  const viennaContext = await browser.newContext({ baseURL, timezoneId: 'Europe/Vienna' });
  const vienna = await readPriceList(await viennaContext.newPage());
  await viennaContext.close();
  expect(newYork).toEqual(vienna);
});
