import { describe, expect, it } from 'vitest';
import {
  calculateAverage,
  convertEnergyPriceUnit,
  convertPriceValue,
  filterByDateRange,
  getTimestampBounds,
} from './data-utils';

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

  it('keeps the repeated DST fall-back hour as two hourly buckets', () => {
    // 2026-10-25 00:00Z and 01:00Z are both 02:00 local time in Vienna.
    const prices = [
      { timestamp: '2026-10-25T00:00:00.000Z', price: 10, unit: 'EUR_MWh' as const },
      { timestamp: '2026-10-25T01:00:00.000Z', price: 30, unit: 'EUR_MWh' as const },
    ];

    expect(calculateAverage(prices, 'hourly')).toEqual(prices);
  });

  it('builds a 24-hour profile with 24 distinct timestamps', () => {
    const prices = Array.from({ length: 24 }, (_, hour) => ({
      timestamp: new Date(2026, 2, 28, hour).toISOString(),
      price: hour,
      unit: 'EUR_MWh' as const,
    }));

    const profile = calculateAverage(prices, 'daily-cycle');
    const timestamps = new Set(profile.map((item) => item.timestamp));
    expect(timestamps.size).toBe(profile.length);
    expect(profile.map((item) => new Date(item.timestamp).getHours())).toEqual(
      Array.from(new Set(prices.map((item) => new Date(item.timestamp).getHours()))).sort((a, b) => a - b)
    );
  });

  it('finds timestamp bounds of arrays larger than the spread-argument limit', () => {
    const start = Date.UTC(2018, 0, 1);
    const prices = Array.from({ length: 70_000 }, (_, index) => ({
      timestamp: new Date(start + index * 3_600_000).toISOString(),
      price: 1,
      unit: 'EUR_MWh' as const,
    }));

    expect(getTimestampBounds(prices)).toEqual({
      earliest: start,
      latest: start + 69_999 * 3_600_000,
    });
    expect(getTimestampBounds([])).toBeNull();
  });

  it('converts single price values between units without float noise', () => {
    expect(convertPriceValue(8.3, 'cent_kWh', 'EUR_MWh')).toBe(83);
    expect(convertPriceValue(8.3, 'EUR_MWh', 'cent_kWh')).toBe(0.83);
    expect(convertPriceValue(-12.5, 'EUR_MWh', 'EUR_MWh')).toBe(-12.5);
  });
});
