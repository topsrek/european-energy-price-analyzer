import { describe, expect, it } from 'vitest';
import { convertEnergyPriceUnit } from './data-utils';

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
});
