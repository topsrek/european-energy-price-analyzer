import { expect, test } from '@playwright/test';
const contrast = (a: string, b: string) => {
  const luminance = (color: string) => {
    const rgb = color.startsWith('#') ? color.slice(1).match(/../g)!.map(v => parseInt(v, 16)) : color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const linear = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
for (const theme of ['light', 'dark']) test(`price and contract lines are distinguishable in ${theme} theme`, async ({ page }) => {
  await page.addInitScript(t => { localStorage.setItem('eepa.hasSeenTour', 'true'); localStorage.setItem('eepa-theme', t); }, theme);
  await page.goto('/at');
  await page.getByRole('button', { name: 'In Preisvergleich anzeigen' }).first().click();
  const chart = page.locator('.recharts-wrapper').first();
  await expect(chart.locator('.recharts-line-curve').first()).toBeVisible();
  const colors = await chart.locator('.recharts-line-curve').evaluateAll(lines => lines.map(line => ({ stroke: getComputedStyle(line).stroke, background: getComputedStyle(line.closest('.bg-card')!).backgroundColor })));
  console.log(theme, colors);
  for (const color of colors) expect.soft(contrast(color.stroke, color.background)).toBeGreaterThanOrEqual(3);
});
