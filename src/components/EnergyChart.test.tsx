// @vitest-environment node
import type { ComponentProps, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import EnergyChart from './EnergyChart';
import { applyFilters, calculateAverage } from '@/utils/data-utils';
import { createDefaultFilters } from '@/utils/analyzer-state';
import type { EnergyPrice, SmartMeterData } from '@/types/energy-data';

const captured = vi.hoisted(() => ({ rows: [] as { consumption?: number; cost?: number }[] }));
vi.mock('recharts', () => {
  const pass = ({ children }: { children: ReactNode }) => children;
  return { ResponsiveContainer: pass, LineChart: ({ data, children }: { data: typeof captured.rows; children: ReactNode }) => {
    captured.rows = data; return children;
  }, Line: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  ReferenceLine: () => null, ReferenceArea: () => null };
});
const zone = 'Europe/Vienna';
const prices: EnergyPrice[] = [
  { timestamp: '2026-01-01T00:00:00.000Z', price: 0, unit: 'cent_kWh' },
  { timestamp: '2026-01-01T01:00:00.000Z', price: 100, unit: 'cent_kWh' },
];
const readings: SmartMeterData[] = prices.map((p, i) => ({ timestamp: p.timestamp, consumption: i ? 1 : 9 }));
function chart(raw: EnergyPrice[], meter = readings, extra: Partial<ComponentProps<typeof EnergyChart>> = {}) {
  return renderToStaticMarkup(<EnergyChart energyPrices={calculateAverage(raw, 'daily', zone)}
    averageEnergyPrices={raw} smartMeterData={meter} showSmartMeterData showTotalCost
    averaging="daily" showZeroLine={false} showAverageLine timeZone={zone} {...extra} />);
}

it.each(['cent_kWh', 'EUR_MWh'] as const)('sums interval costs before daily averaging in %s, including VAT', (unit) => {
  const raw = prices.map(p => ({ ...p, unit, price: unit === 'EUR_MWh' ? p.price * 10 : p.price }));
  chart(raw);
  expect(captured.rows[0].cost).toBe(1);
  chart(raw, readings, { showSpotPriceWithTax: true, vatRate: 0.2 });
  expect(captured.rows[0].cost).toBeCloseTo(1.2);
});

it('excludes unselected hours from daily consumption and cost', () => {
  const raw = applyFilters(prices, { ...createDefaultFilters(), hours: [1] }, zone, 'daily');
  chart(raw);
  expect(captured.rows[0].consumption).toBe(9);
  expect(captured.rows[0].cost).toBe(0);
});

it('excludes readings outside the selected range from daily-cycle consumption', () => {
  chart([prices[0]], [...readings, { timestamp: '2025-12-01T00:00:00.000Z', consumption: 20 }], {
    energyPrices: calculateAverage([prices[0]], 'daily-cycle', zone), averaging: 'daily-cycle',
  });
  expect(captured.rows[0].consumption).toBe(9);
});
