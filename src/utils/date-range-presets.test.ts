import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import { getActiveQuickRangePreset, getQuickRangeDates } from './date-range-presets';

describe('date range presets', () => {
  it('builds the one-day preset for only the selected calendar day', () => {
    const endDate = new Date('2026-05-06T21:45:00.000Z');
    const { startDate } = getQuickRangeDates('1d', endDate);

    expect(format(startDate, 'yyyy-MM-dd')).toBe('2026-05-06');
  });

  it('builds the three-day preset including the selected end day', () => {
    const endDate = new Date('2026-05-06T21:45:00.000Z');
    const { startDate } = getQuickRangeDates('3d', endDate);

    expect(format(startDate, 'yyyy-MM-dd')).toBe('2026-05-04');
  });

  it('builds the six-month preset relative to the selected end day', () => {
    const endDate = new Date('2026-05-06T21:45:00.000Z');
    const { startDate } = getQuickRangeDates('6m', endDate);

    expect(format(startDate, 'yyyy-MM-dd')).toBe('2025-11-06');
  });

  it('builds the one-year preset relative to the latest available date', () => {
    const endDate = new Date('2026-05-06T21:45:00.000Z');
    const { startDate } = getQuickRangeDates('1y', endDate);

    expect(format(startDate, 'yyyy-MM-dd')).toBe('2025-05-06');
  });

  it('clamps presets to the earliest available date', () => {
    const endDate = new Date('2026-05-06T21:45:00.000Z');
    const minDate = new Date('2026-04-01T12:00:00.000Z');
    const { startDate } = getQuickRangeDates('1y', endDate, minDate);

    expect(format(startDate, 'yyyy-MM-dd')).toBe('2026-04-01');
  });

  it('matches the active preset by calendar day', () => {
    const maxDate = new Date('2026-05-06T21:45:00.000Z');
    const startDate = new Date('2025-05-06T00:00:00.000Z');
    const endDate = new Date('2026-05-06T00:00:00.000Z');

    expect(getActiveQuickRangePreset(startDate, endDate, maxDate)).toBe('1y');
  });

  it('returns null for custom dates', () => {
    const maxDate = new Date('2026-05-06T21:45:00.000Z');
    const startDate = new Date('2025-07-01T00:00:00.000Z');
    const endDate = new Date('2026-05-06T00:00:00.000Z');

    expect(getActiveQuickRangePreset(startDate, endDate, maxDate)).toBeNull();
  });
});
