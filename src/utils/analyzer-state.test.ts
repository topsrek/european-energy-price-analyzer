import { describe, expect, it } from 'vitest';
import {
  createDefaultFilters,
  parseAveragingQueryParam,
  parseFilterQueryParam,
  parseQueryNumber,
  readFiltersFromQuery,
  serializeFilterQueryParam,
  writeFiltersToQuery,
} from './analyzer-state';

describe('parseQueryNumber', () => {
  it('accepts German decimal input for chart bounds', () => {
    expect(parseQueryNumber('12,5')).toBe(12.5);
  });

  it('parses partially typed numbers and rejects garbage', () => {
    expect(parseQueryNumber('8.')).toBe(8);
    expect(parseQueryNumber('8,')).toBe(8);
    expect(parseQueryNumber('-')).toBeNull();
    expect(parseQueryNumber('abc')).toBeNull();
    expect(parseQueryNumber('')).toBeNull();
  });
});

describe('filter query params', () => {
  it('treats a missing parameter as "use the default"', () => {
    expect(parseFilterQueryParam(null, 'months')).toBeNull();
  });

  it('treats an empty parameter as an explicitly cleared filter for every filter', () => {
    expect(parseFilterQueryParam('', 'months')).toEqual([]);
    expect(parseFilterQueryParam('', 'weekdays')).toEqual([]);
    expect(parseFilterQueryParam('', 'hours')).toEqual([]);
    expect(parseFilterQueryParam('', 'daysOfMonth')).toEqual([]);
    expect(parseFilterQueryParam('', 'weeksOfYear')).toEqual([]);
  });

  it('drops empty items, non-numbers and out-of-range values', () => {
    expect(parseFilterQueryParam('0,,11,12,-1,abc,1.5, 3 ,3', 'months')).toEqual([0, 3, 11]);
    expect(parseFilterQueryParam('0,6,7', 'weekdays')).toEqual([0, 6]);
    expect(parseFilterQueryParam('0,23,24', 'hours')).toEqual([0, 23]);
    expect(parseFilterQueryParam('0,1,31,32', 'daysOfMonth')).toEqual([1, 31]);
    expect(parseFilterQueryParam('0,1,53,54', 'weeksOfYear')).toEqual([1, 53]);
  });

  it('omits the parameter for a full selection and writes an empty value when cleared', () => {
    const defaults = createDefaultFilters();
    expect(serializeFilterQueryParam(defaults.months, 'months')).toBeNull();
    expect(serializeFilterQueryParam([], 'daysOfMonth')).toBe('');
    expect(serializeFilterQueryParam([5, 2, 2], 'hours')).toBe('2,5');
  });

  it('round-trips filters through the URL', () => {
    const filters = {
      ...createDefaultFilters(),
      months: [],
      weekdays: [1, 2],
      daysOfMonth: [],
    };
    const params = new URLSearchParams('keep=1');
    writeFiltersToQuery(params, filters);

    expect(params.get('keep')).toBe('1');
    expect(params.has('f_h')).toBe(false);
    expect(params.has('f_w')).toBe(false);
    expect(readFiltersFromQuery(new URLSearchParams(params.toString()))).toEqual(filters);
  });

  it('removes filter parameters again when the selection becomes full', () => {
    const params = new URLSearchParams('f_m=1,2&f_dm=');
    writeFiltersToQuery(params, createDefaultFilters());
    expect(params.toString()).toBe('');
  });
});

describe('parseAveragingQueryParam', () => {
  it('accepts known averaging options only', () => {
    expect(parseAveragingQueryParam('daily-cycle')).toBe('daily-cycle');
    expect(parseAveragingQueryParam('monthly')).toBe('monthly');
    expect(parseAveragingQueryParam('bogus')).toBeNull();
    expect(parseAveragingQueryParam(null)).toBeNull();
  });
});
