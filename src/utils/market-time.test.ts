import { TZDate } from '@date-fns/tz';
import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { getQuickRangeDates } from './date-range-presets';
import { formatLocalDateForQuery } from './local-date';
import {
  formatMarketDate,
  getMarketCalendarDay,
  getMarketDateParts,
  getMarketDayEnd,
  getMarketDayKey,
  getMarketDayStart,
  getMarketTime,
  getMarketWeekStartKey,
  MARKET_TIMEZONE,
} from './market-time';

// Results must not depend on the viewer's TZ; `npm run test:tz` runs this file under several.
const TZ = 'Europe/Vienna';

describe('market time', () => {
  it('reads calendar fields in the market time zone', () => {
    expect(getMarketDateParts('2026-09-29T21:00:00.000Z', TZ)).toEqual({
      year: 2026,
      month: 8,
      day: 29,
      hour: 23,
      minute: 0,
      weekday: 2,
      dayIndex: Date.UTC(2026, 8, 29) / 86_400_000,
      isoWeek: 40,
      isoWeekYear: 2026,
    });
    expect(getMarketDateParts('2026-09-29T22:15:00.000Z', TZ)).toMatchObject({ day: 30, hour: 0, minute: 15 });
    expect(getMarketDateParts('2026-01-15T23:00:00.000Z', TZ)).toMatchObject({ day: 16, hour: 0 });
    expect(getMarketDateParts('2026-01-15T23:00:00.000Z', 'America/New_York')).toMatchObject({ day: 15, hour: 18 });
  });

  it('agrees with TZDate across 2026, hourly around both DST switches', () => {
    const times: number[] = [];
    // Every 13 hours cycles through all hours of the day; the switch days are checked hourly.
    for (let time = Date.UTC(2025, 11, 31); time < Date.UTC(2027, 0, 2); time += 13 * 3_600_000) times.push(time);
    for (const [from, to] of [['2026-03-28T12:00Z', '2026-03-29T12:00Z'], ['2026-10-24T12:00Z', '2026-10-25T12:00Z']]) {
      for (let time = Date.parse(from); time <= Date.parse(to); time += 3_600_000) times.push(time);
    }

    const mismatches = times.filter((time) => {
      const parts = getMarketDateParts(time, TZ);
      const reference = new TZDate(time, TZ);
      return (
        parts.year !== reference.getFullYear() ||
        parts.month !== reference.getMonth() ||
        parts.day !== reference.getDate() ||
        parts.hour !== reference.getHours() ||
        parts.weekday !== reference.getDay() ||
        parts.isoWeek !== getISOWeek(reference) ||
        parts.isoWeekYear !== getISOWeekYear(reference)
      );
    });
    expect(mismatches.map((time) => new Date(time).toISOString())).toEqual([]);
  }, 20_000);

  it('computes ISO weeks across year boundaries', () => {
    // Fri 01.01.2027 00:30 Vienna belongs to ISO week 53 of 2026.
    expect(getMarketDateParts('2026-12-31T23:30:00.000Z', TZ)).toMatchObject({ isoWeek: 53, isoWeekYear: 2026 });
    // Mon 29.12.2025 belongs to ISO week 1 of 2026.
    expect(getMarketDateParts('2025-12-28T23:30:00.000Z', TZ)).toMatchObject({ isoWeek: 1, isoWeekYear: 2026 });
  });

  it('builds day and week keys', () => {
    const parts = getMarketDateParts('2026-05-31T22:30:00.000Z', TZ); // Mon 01.06.2026
    expect(getMarketDayKey(parts)).toBe('2026-06-01');
    expect(getMarketWeekStartKey(parts)).toBe('2026-06-01');
    expect(getMarketWeekStartKey(getMarketDateParts('2026-05-31T21:30:00.000Z', TZ))).toBe('2026-05-25');
  });

  it('converts market wall-clock times to instants', () => {
    expect(new Date(getMarketTime(TZ, 2026, 8, 1)).toISOString()).toBe('2026-08-31T22:00:00.000Z');
    expect(new Date(getMarketTime(TZ, 2026, 0, 1)).toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(new Date(getMarketTime(TZ, 2026, 9, 25, 3)).toISOString()).toBe('2026-10-25T02:00:00.000Z');
    expect(new Date(getMarketTime(TZ, 2026, 2, 29, 3)).toISOString()).toBe('2026-03-29T01:00:00.000Z');
  });

  it('maps calendar days to market day boundaries, including 23h and 25h days', () => {
    const iso = (time: number) => new Date(time).toISOString();
    const day = new Date(2026, 8, 29);
    expect(iso(getMarketDayStart(day, TZ))).toBe('2026-09-28T22:00:00.000Z');
    expect(iso(getMarketDayEnd(day, TZ))).toBe('2026-09-29T21:59:59.999Z');

    const fallBack = new Date(2026, 9, 25);
    expect((getMarketDayEnd(fallBack, TZ) + 1 - getMarketDayStart(fallBack, TZ)) / 3_600_000).toBe(25);
    const springForward = new Date(2026, 2, 29);
    expect((getMarketDayEnd(springForward, TZ) + 1 - getMarketDayStart(springForward, TZ)) / 3_600_000).toBe(23);
  });

  it('derives the latest market day as a calendar-day date for pickers and URL params', () => {
    const latestDay = getMarketCalendarDay('2026-09-29T22:45:00.000Z', TZ); // 30.09. 00:45 Vienna
    expect(latestDay).toEqual(new Date(2026, 8, 30));
    expect(formatLocalDateForQuery(latestDay)).toBe('2026-09-30');
    expect(format(getQuickRangeDates('1w', latestDay).startDate, 'yyyy-MM-dd')).toBe('2026-09-24');
  });

  it('formats labels in the market time zone', () => {
    expect(formatMarketDate('2026-08-31T22:00:00.000Z', 'dd.MM.yyyy HH:mm', TZ)).toBe('01.09.2026 00:00');
    expect(formatMarketDate('2026-08-31T22:00:00.000Z', 'MMMM yyyy', TZ)).toBe('September 2026');
    expect(formatMarketDate(Date.parse('2026-10-25T01:00:00.000Z'), 'HH:mm', TZ)).toBe('02:00');
  });

  it('uses Vienna as the shared market time zone', () => {
    expect(MARKET_TIMEZONE).toBe('Europe/Vienna');
  });
});
