import { describe, expect, it } from 'vitest';
import { calculateAverage, convertEnergyPriceUnit } from './data-utils';

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
});
