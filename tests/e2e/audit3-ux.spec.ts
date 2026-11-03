import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('eepa.hasSeenTour', 'true'));
});

test('wheel at full chart extent scrolls the page', async ({ page }) => {
  await page.goto('/at');
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart).toBeVisible();
  await chart.scrollIntoViewIfNeeded();
  await chart.hover();
  const before = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
});

for (const path of ['/at', '/compare']) {
  test(`connection failure can be retried on ${path}`, async ({ page }) => {
    await page.route('**/api/*.bin', route => route.abort());
    await page.goto(path);
    await expect(page.getByText(/Verbindung fehlgeschlagen.*Österreich/).first()).toBeVisible();
    await page.unroute('**/api/*.bin');
    await page.getByRole('button', { name: 'Erneut laden' }).first().click();
    await expect(page.locator('.recharts-wrapper').first()).toBeVisible();
    await expect(page.getByText(/Verbindung fehlgeschlagen/)).toHaveCount(0);
  });
}

test('German UI metadata and not-found content', async ({ page }) => {
  for (const [path, title] of [['/fr', 'Strompreisrechner Frankreich'], ['/', 'European Energy Price Analyzer'], ['/privacy', 'Datenschutz'], ['/impressum', 'Impressum'], ['/fr/faqs', 'FAQ'], ['/unknown', 'Seite nicht gefunden']]) {
    await page.goto(path);
    await expect(page).toHaveTitle(new RegExp(title));
    await expect(page.locator('html')).toHaveAttribute('lang', 'de-AT');
  }
  await expect(page.getByRole('main')).toContainText('Seite nicht gefunden');
  await page.getByRole('link', { name: 'Zur Startseite' }).click();
  await expect(page).toHaveTitle('European Energy Price Analyzer - EEPA');
});

test('help describes only available regional features', async ({ page }) => {
  for (const [region, name] of [['at', 'Österreich'], ['fr', 'Frankreich']]) {
    await page.goto(`/${region}`);
    await page.getByRole('button', { name: /Hilfe/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(name);
    await expect(dialog).not.toContainText('Balkendiagramm');
    await expect(dialog).not.toContainText('Fixkosten ein oder aus');
    if (region === 'at') await expect(dialog).toContainText('in Vorbereitung');
    else await expect(dialog).not.toContainText('Tarifvergleich');
    await page.keyboard.press('Escape');
  }
});

test('tariff controls have names and accept empty editing', async ({ page }) => {
  await page.goto('/at');
  await expect(page.getByRole('slider', { name: 'Jahresverbrauch', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Build-Informationen' })).toHaveCount(1);
  await page.getByRole('switch', { name: 'Durchschnitt berechnen' }).click();
  await expect(page.getByRole('combobox', { name: 'Durchschnitt', exact: true })).toBeEnabled();
  for (const name of ['Arbeitspreis in Cent/kWh', 'Grundpauschale in €']) {
    const input = page.getByRole('spinbutton', { name, exact: true });
    await input.fill('');
    await expect(input).toHaveValue('');
    await input.fill('12.5');
    await expect(input).toHaveValue('12.5');
  }
  await page.getByRole('tab', { name: 'Smart Meter Daten' }).click();
  const file = page.locator('input[type=file]');
  await file.evaluate((el: HTMLElement) => el.focus());
  await expect(file).not.toBeFocused();
});

test('FAQ answers reflect regional features and quarter-hour prices', async ({ page }) => {
  for (const region of ['at', 'de-lu', 'fr']) {
    await page.goto(`/${region}/faqs`);
    await page.getByRole('button', { name: /Was ist der Spotmarkt-Preis/ }).click();
    await expect(page.getByRole('region').first()).toContainText('15 Minuten');
    if (region !== 'at') await expect(page.getByRole('button', { name: /Wie hoch sind die Netzkosten/ })).toHaveCount(0);
  }
});

test('privacy explains controller, logs and local preferences accurately', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByRole('main')).not.toContainText('nicht bestimmten Personen zuordenbar');
  await expect(page.getByRole('main')).toContainText('Art. 6 Abs. 1 lit. f DSGVO');
  await expect(page.getByRole('main')).toContainText('Datenschutzbehörde');
  await expect(page.getByRole('main')).toContainText('eepa.selectedRegion');
  await expect(page.getByRole('link', { name: 'Impressum', exact: true })).toBeVisible();
});
