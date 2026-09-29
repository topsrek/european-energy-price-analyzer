import { describe, expect, it } from 'vitest';
import { formatLocalDateForQuery, parseLocalDateFromQuery } from './local-date';

describe('parseLocalDateFromQuery', () => {
  it('parses valid yyyy-MM-dd dates as local midnight', () => {
    expect(parseLocalDateFromQuery('2026-02-28')).toEqual(new Date(2026, 1, 28));
    expect(parseLocalDateFromQuery('2024-02-29')).toEqual(new Date(2024, 1, 29));
  });

  it('rejects dates that would roll over', () => {
    expect(parseLocalDateFromQuery('2026-02-31')).toBeNull();
    expect(parseLocalDateFromQuery('2026-02-29')).toBeNull();
    expect(parseLocalDateFromQuery('2026-13-01')).toBeNull();
    expect(parseLocalDateFromQuery('2026-00-10')).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(parseLocalDateFromQuery(null)).toBeNull();
    expect(parseLocalDateFromQuery('')).toBeNull();
    expect(parseLocalDateFromQuery('2026-05')).toBeNull();
    expect(parseLocalDateFromQuery('2026-05-06T00:00')).toBeNull();
    expect(parseLocalDateFromQuery('abcd-ef-gh')).toBeNull();
  });

  it('round-trips with formatLocalDateForQuery', () => {
    const date = new Date(2026, 9, 25);
    expect(parseLocalDateFromQuery(formatLocalDateForQuery(date))).toEqual(date);
  });
});
