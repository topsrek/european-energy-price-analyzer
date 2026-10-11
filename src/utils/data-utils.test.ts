import { describe, expect, it } from 'vitest';
import type { EnergyPrice, FilterOptions } from '@/types/energy-data';
import {
  aggregateConsumptionByPriceRow,
  applyFilters,
  calculateAverage,
  convertEnergyPriceUnit,
  convertPriceValue,
  filterByDateRange,
  getTimestampBounds,
  parseSmartMeterData,
  parseSmartMeterTimestamp,
} from './data-utils';
import { getMarketDateParts } from './market-time';

// Expected values are market (Vienna) time and must hold for every viewer TZ (see npm run test:tz).
const TZ = 'Europe/Vienna';
const HOUR_MS = 3_600_000;

const hourlyPrices = (fromIso: string, toIso: string): EnergyPrice[] => {
  const prices: EnergyPrice[] = [];
  for (let time = Date.parse(fromIso); time <= Date.parse(toIso); time += HOUR_MS) {
    prices.push({ timestamp: new Date(time).toISOString(), price: prices.length, unit: 'EUR_MWh' });
  }
  return prices;
};

const ALL_FILTERS: FilterOptions = {
  months: Array.from({ length: 12 }, (_, index) => index),
  weekdays: Array.from({ length: 7 }, (_, index) => index),
  hours: Array.from({ length: 24 }, (_, index) => index),
  daysOfMonth: Array.from({ length: 31 }, (_, index) => index + 1),
  weeksOfYear: Array.from({ length: 53 }, (_, index) => index + 1),
};

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

    expect(calculateAverage(prices, 'weekly', TZ)).toEqual([
      { timestamp: '2026-05-04T00:00:00.000Z', price: 15, unit: 'EUR_MWh' },
      { timestamp: '2026-05-11T00:00:00.000Z', price: 40, unit: 'EUR_MWh' },
    ]);
  });

  it('filters a same-day range to that market calendar day only', () => {
    const previousDay = '2026-05-05T21:00:00.000Z'; // 05.05. 23:00 CEST
    const dayStart = '2026-05-05T22:00:00.000Z'; // 06.05. 00:00 CEST
    const dayEnd = '2026-05-06T21:00:00.000Z'; // 06.05. 23:00 CEST
    const nextDay = '2026-05-06T22:00:00.000Z'; // 07.05. 00:00 CEST
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
        new Date(2026, 4, 6),
        TZ
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

    expect(calculateAverage(prices, 'hourly', TZ)).toEqual(prices);
  });

  it('builds a 24-hour profile keyed by market hour with 24 distinct timestamps', () => {
    // Market day 2026-03-28 (CET): 00:00 local = 2026-03-27T23:00Z; price = market hour.
    const prices = hourlyPrices('2026-03-27T23:00:00.000Z', '2026-03-28T22:00:00.000Z');

    const profile = calculateAverage(prices, 'daily-cycle', TZ);
    expect(new Set(profile.map((item) => item.timestamp)).size).toBe(24);
    expect(profile.map((item) => getMarketDateParts(item.timestamp, TZ).hour)).toEqual(
      Array.from({ length: 24 }, (_, hour) => hour)
    );
    expect(profile.map((item) => item.price)).toEqual(Array.from({ length: 24 }, (_, hour) => hour));
    expect(profile[0].timestamp).toBe('1999-12-31T23:00:00.000Z');
  });

  it('filters by market hour, weekday, day of month, month and ISO week', () => {
    // 2026-05-31T22:30Z is Monday 01.06.2026 00:30 in Vienna (ISO week 23); the viewer's
    // local calendar would say Sunday 31.05. (UTC/New York) or 07:30 (Tokyo).
    const prices: EnergyPrice[] = [
      { timestamp: '2026-05-31T21:30:00.000Z', price: 1, unit: 'EUR_MWh' },
      { timestamp: '2026-05-31T22:30:00.000Z', price: 2, unit: 'EUR_MWh' },
    ];

    const only = (overrides: Partial<FilterOptions>) =>
      applyFilters(prices, { ...ALL_FILTERS, ...overrides }, TZ).map((item) => item.price);

    expect(only({ hours: [0] })).toEqual([2]);
    expect(only({ hours: [23] })).toEqual([1]);
    expect(only({ weekdays: [1] })).toEqual([2]);
    expect(only({ weekdays: [0] })).toEqual([1]);
    expect(only({ daysOfMonth: [1] })).toEqual([2]);
    expect(only({ months: [5] })).toEqual([2]);
    expect(only({ months: [4] })).toEqual([1]);
    expect(only({ weeksOfYear: [23] })).toEqual([2]);
    expect(only({ weeksOfYear: [22] })).toEqual([1]);
  });

  it('filters a selected range by market days', () => {
    const prices = hourlyPrices('2026-08-31T20:00:00.000Z', '2026-09-29T23:00:00.000Z');
    const filtered = filterByDateRange(prices, new Date(2026, 8, 1), new Date(2026, 8, 29), TZ);

    expect(filtered[0].timestamp).toBe('2026-08-31T22:00:00.000Z'); // 01.09. 00:00 CEST
    expect(filtered[filtered.length - 1].timestamp).toBe('2026-09-29T21:00:00.000Z'); // 29.09. 23:00 CEST
    expect(filtered).toHaveLength(29 * 24);
  });

  it('buckets daily, weekly and monthly averages at market midnight', () => {
    const prices: EnergyPrice[] = [
      { timestamp: '2026-05-31T21:00:00.000Z', price: 10, unit: 'EUR_MWh' }, // Sun 31.05. 23:00
      { timestamp: '2026-05-31T22:00:00.000Z', price: 20, unit: 'EUR_MWh' }, // Mon 01.06. 00:00
      { timestamp: '2026-06-01T21:00:00.000Z', price: 40, unit: 'EUR_MWh' }, // Mon 01.06. 23:00
    ];
    const expected = [
      { timestamp: '2026-05-31T21:00:00.000Z', price: 10, unit: 'EUR_MWh' },
      { timestamp: '2026-05-31T22:00:00.000Z', price: 30, unit: 'EUR_MWh' },
    ];

    expect(calculateAverage(prices, 'daily', TZ)).toEqual(expected);
    expect(calculateAverage(prices, 'weekly', TZ)).toEqual(expected);
    expect(calculateAverage(prices, 'monthly', TZ)).toEqual(expected);
  });

  it('handles the 25-hour DST fall-back market day (2026-10-25)', () => {
    const prices = hourlyPrices('2026-10-24T18:00:00.000Z', '2026-10-26T03:00:00.000Z');
    const day = filterByDateRange(prices, new Date(2026, 9, 25), new Date(2026, 9, 25), TZ);

    expect(day).toHaveLength(25);
    expect(day[0].timestamp).toBe('2026-10-24T22:00:00.000Z'); // 00:00 CEST
    expect(day[24].timestamp).toBe('2026-10-25T22:00:00.000Z'); // 23:00 CET
    expect(day.map((item) => getMarketDateParts(item.timestamp, TZ).hour)).toEqual([
      0, 1, 2, 2, ...Array.from({ length: 21 }, (_, index) => index + 3),
    ]);

    // Both 02:00 hours stay separate hourly buckets but share one daily bucket.
    expect(calculateAverage(day, 'hourly', TZ)).toHaveLength(25);
    expect(calculateAverage(day, 'daily', TZ)).toEqual([
      { timestamp: day[0].timestamp, price: day.reduce((sum, item) => sum + item.price, 0) / 25, unit: 'EUR_MWh' },
    ]);
    expect(
      applyFilters(day, { ...ALL_FILTERS, hours: [2] }, TZ).map((item) => item.timestamp)
    ).toEqual(['2026-10-25T00:00:00.000Z', '2026-10-25T01:00:00.000Z']);
  });

  it('handles the 23-hour DST spring-forward market day (2026-03-29)', () => {
    const prices = hourlyPrices('2026-03-28T18:00:00.000Z', '2026-03-30T03:00:00.000Z');
    const day = filterByDateRange(prices, new Date(2026, 2, 29), new Date(2026, 2, 29), TZ);

    expect(day).toHaveLength(23);
    expect(day[0].timestamp).toBe('2026-03-28T23:00:00.000Z'); // 00:00 CET
    expect(day[22].timestamp).toBe('2026-03-29T21:00:00.000Z'); // 23:00 CEST
    expect(applyFilters(day, { ...ALL_FILTERS, hours: [2] }, TZ)).toEqual([]);
    expect(calculateAverage(day, 'daily-cycle', TZ)).toHaveLength(23);
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

  it('reads naive smart-meter timestamps as market time, independent of the viewer TZ', () => {
    expect(parseSmartMeterTimestamp('2026-05-01 00:00', TZ)).toBe(Date.parse('2026-04-30T22:00:00Z'));
    expect(parseSmartMeterTimestamp('2026-05-01T00:15:00', TZ)).toBe(Date.parse('2026-04-30T22:15:00Z'));
    expect(parseSmartMeterTimestamp('2026-01-15', TZ)).toBe(Date.parse('2026-01-14T23:00:00Z'));
    expect(parseSmartMeterTimestamp('2026-05-01T00:00:00Z', TZ)).toBe(Date.parse('2026-05-01T00:00:00Z'));
    expect(parseSmartMeterTimestamp('2026-05-01T00:00:00+01:00', TZ)).toBe(Date.parse('2026-04-30T23:00:00Z'));
  });

  it('reads German dd.MM.yyyy smart-meter dates day-first', () => {
    expect(parseSmartMeterTimestamp('01.05.2026 00:00', TZ)).toBe(Date.parse('2026-04-30T22:00:00Z'));
    expect(parseSmartMeterTimestamp('13.05.2026 07:45:00', TZ)).toBe(Date.parse('2026-05-13T05:45:00Z'));
    expect(parseSmartMeterTimestamp('31.02.2026 00:00', TZ)).toBeNaN();
    expect(parseSmartMeterTimestamp('05/01/2026 00:00', TZ)).toBeNaN();
  });

  it('parses a German CSV export and reports bad timestamps', () => {
    const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
    expect(parseSmartMeterData(encode('Datum;Verbrauch\n01.05.2026 00:00;0,25\n'), TZ)).toEqual([
      { timestamp: '2026-04-30T22:00:00.000Z', consumption: 0.25 },
    ]);
    expect(() => parseSmartMeterData(encode('date,kwh\nyesterday,1\n'), TZ)).toThrow(/Zeitstempel/);
  });

  it('sums 15-minute consumption into hourly and daily price rows', () => {
    const prices = hourlyPrices('2026-04-30T22:00:00Z', '2026-04-30T23:00:00Z');
    const readings = Array.from({ length: 8 }, (_, index) => ({
      timestamp: new Date(Date.parse('2026-04-30T22:00:00Z') + index * 15 * 60_000).toISOString(),
      consumption: 0.25,
    }));

    const hourly = aggregateConsumptionByPriceRow(prices, readings, 'none', 'hourly', TZ);
    expect(hourly.get('2026-04-30T22:00:00.000Z')).toBeCloseTo(1, 9);
    expect(hourly.get('2026-04-30T23:00:00.000Z')).toBeCloseTo(1, 9);

    const daily = aggregateConsumptionByPriceRow(calculateAverage(prices, 'daily', TZ), readings, 'daily', 'hourly', TZ);
    expect(daily.get('2026-04-30T22:00:00.000Z')).toBeCloseTo(2, 9);
  });

  it('treats every cleared filter as "match nothing" and ignores filters disabled by averaging', () => {
    const prices = hourlyPrices('2026-05-04T22:00:00Z', '2026-05-05T21:00:00Z');
    expect(applyFilters(prices, { ...ALL_FILTERS, daysOfMonth: [] }, TZ)).toEqual([]);
    expect(applyFilters(prices, { ...ALL_FILTERS, weeksOfYear: [] }, TZ)).toEqual([]);
    expect(applyFilters(prices, { ...ALL_FILTERS, months: [0] }, TZ, 'monthly')).toHaveLength(24);
    expect(applyFilters(prices, { ...ALL_FILTERS, hours: [3] }, TZ, 'daily-cycle')).toHaveLength(24);
    expect(applyFilters(prices, { ...ALL_FILTERS, hours: [3] }, TZ, 'daily')).toHaveLength(1);
  });
});
