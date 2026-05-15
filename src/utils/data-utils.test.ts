import { describe, expect, it } from 'vitest';
import { calculateAverage, convertEnergyPriceUnit, filterByDateRange } from './data-utils';

describe('data utils', () => {
  it('converts price units between EUR/MWh and cent/kWh', () => {
    const prices = [
      { timestamp: '2026-05-06T12:00:00.000Z', price: 123.4, unit: 'EUR_MWh' as const },
      { timestamp: '2026-05-06T13:00:00.000Z', price: -25, unit: 'EUR_MWh' as const },
    ];

    expect(convertEnergyPriceUnit(prices, 'cent_kWh')).toEqual([
      { timestamp: '2026-05-06T12:00:00.000Z', price: 12.34, unit: 'cent_kWh' },
      { timestamp: '2026-05-06T13:00:00.000Z', price: -2.5, unit: 'cent_kWh' },
    ]);
    expect(convertEnergyPriceUnit(convertEnergyPriceUnit(prices, 'cent_kWh'), 'EUR_MWh')).toEqual(prices);
  });

  it('calculates weekly averages', () => {
    const prices = [
      { timestamp: '2026-05-04T00:00:00.000Z', price: 10, unit: 'EUR_MWh' as const },
      { timestamp: '2026-05-05T00:00:00.000Z', price: 20, unit: 'EUR_MWh' as const },
      { timestamp: '2026-05-11T00:00:00.000Z', price: 40, unit: 'EUR_MWh' as const },
    ];

    expect(calculateAverage(prices, 'weekly')).toEqual([
      { timestamp: '2026-05-04T00:00:00.000Z', price: 15, unit: 'EUR_MWh' },
      { timestamp: '2026-05-11T00:00:00.000Z', price: 40, unit: 'EUR_MWh' },
    ]);
  });

  it('filters a same-day range to that calendar day only', () => {
    const previousDay = new Date(2026, 4, 5, 23).toISOString();
    const dayStart = new Date(2026, 4, 6, 0).toISOString();
    const dayEnd = new Date(2026, 4, 6, 23).toISOString();
    const nextDay = new Date(2026, 4, 7, 0).toISOString();
    const prices = [
      { timestamp: previousDay, price: 10, unit: 'EUR_MWh' as const },
      { timestamp: dayStart, price: 20, unit: 'EUR_MWh' as const },
      { timestamp: dayEnd, price: 30, unit: 'EUR_MWh' as const },
      { timestamp: nextDay, price: 40, unit: 'EUR_MWh' as const },
    ];

    expect(
      filterByDateRange(
        prices,
        new Date(2026, 4, 6),
        new Date(2026, 4, 6)
      )
    ).toEqual([
      { timestamp: dayStart, price: 20, unit: 'EUR_MWh' },
      { timestamp: dayEnd, price: 30, unit: 'EUR_MWh' },
    ]);
  });
});
