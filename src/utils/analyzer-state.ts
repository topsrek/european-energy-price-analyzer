import { RegionCode } from '@/config/regions';
import { safeStorageGetItem } from '@/lib/safe-storage';
import { AveragingOption, DataResolution, EnergyPrice, FilterOptions } from '@/types/energy-data';

export type PriceUnit = EnergyPrice['unit'];

export const DATA_RESOLUTION_STORAGE_KEY = 'eepa.dataResolution';
export const PRICE_UNIT_STORAGE_KEY = 'eepa.priceUnit';
export const DEFAULT_DATA_RESOLUTION: DataResolution = 'hourly';
export const DEFAULT_PRICE_UNIT: PriceUnit = 'cent_kWh';

export const isDataResolution = (value: string | null): value is DataResolution =>
  value === 'hourly' || value === 'interval';

export const isPriceUnit = (value: string | null): value is PriceUnit =>
  value === 'EUR_MWh' || value === 'cent_kWh';

export const parseResolutionQueryParam = (value: string | null): DataResolution | null => {
  if (value === '15min' || value === 'interval') return 'interval';
  if (value === 'hourly') return 'hourly';
  return null;
};

export const serializeResolutionQueryParam = (value: DataResolution) =>
  value === 'interval' ? '15min' : 'hourly';

export const parseUnitQueryParam = (value: string | null): PriceUnit | null => {
  if (value === 'eurmwh' || value === 'EUR_MWh') return 'EUR_MWh';
  if (value === 'ckwh' || value === 'cent_kWh') return 'cent_kWh';
  return null;
};

export const serializeUnitQueryParam = (value: PriceUnit) =>
  value === 'EUR_MWh' ? 'eurmwh' : 'ckwh';

export const readInitialDataResolution = (): DataResolution => {
  if (typeof window === 'undefined') return DEFAULT_DATA_RESOLUTION;

  const params = new URLSearchParams(window.location.search);
  const queryValue = parseResolutionQueryParam(params.get('resolution'));
  if (queryValue) return queryValue;

  const storedValue = safeStorageGetItem(DATA_RESOLUTION_STORAGE_KEY);
  if (isDataResolution(storedValue)) return storedValue;

  return DEFAULT_DATA_RESOLUTION;
};

export const readInitialPriceUnit = (): PriceUnit => {
  if (typeof window === 'undefined') return DEFAULT_PRICE_UNIT;

  const params = new URLSearchParams(window.location.search);
  const queryValue = parseUnitQueryParam(params.get('unit'));
  if (queryValue) return queryValue;

  const storedValue = safeStorageGetItem(PRICE_UNIT_STORAGE_KEY);
  if (isPriceUnit(storedValue)) return storedValue;

  return DEFAULT_PRICE_UNIT;
};

export const parseQueryNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const serializeOptionalNumber = (value: number | null) =>
  value === null || Number.isNaN(value) ? null : String(value);

export const parseRegionCodesQueryParam = (
  value: string | null,
  supportedCodes: RegionCode[]
): RegionCode[] => {
  if (!value) return [];

  const supported = new Set(supportedCodes);
  return value
    .split(',')
    .map((code) => code.trim().toLowerCase() as RegionCode)
    .filter((code, index, array) => supported.has(code) && array.indexOf(code) === index);
};

type FilterKey = keyof FilterOptions;

interface FilterDefinition {
  queryParam: string;
  min: number;
  max: number;
}

/**
 * Value ranges follow the conventions used by applyFilters / FilterOptions:
 * months 0-11 (date-fns getMonth), weekdays 0-6 (0 = Sunday), hours 0-23,
 * days of month 1-31, ISO weeks 1-53.
 */
export const FILTER_DEFINITIONS: Record<FilterKey, FilterDefinition> = {
  months: { queryParam: 'f_m', min: 0, max: 11 },
  weekdays: { queryParam: 'f_wd', min: 0, max: 6 },
  hours: { queryParam: 'f_h', min: 0, max: 23 },
  daysOfMonth: { queryParam: 'f_dm', min: 1, max: 31 },
  weeksOfYear: { queryParam: 'f_w', min: 1, max: 53 },
};

const FILTER_KEYS = Object.keys(FILTER_DEFINITIONS) as FilterKey[];

const fullFilterRange = (key: FilterKey) => {
  const { min, max } = FILTER_DEFINITIONS[key];
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
};

export const createDefaultFilters = (): FilterOptions => ({
  months: fullFilterRange('months'),
  weekdays: fullFilterRange('weekdays'),
  hours: fullFilterRange('hours'),
  daysOfMonth: fullFilterRange('daysOfMonth'),
  weeksOfYear: fullFilterRange('weeksOfYear'),
});

/**
 * Parses one filter query parameter.
 * - missing parameter (null) -> null (caller uses the full default selection)
 * - present but empty ("") -> [] (the user explicitly cleared this filter)
 * - otherwise: integers within the filter's range, deduplicated and sorted;
 *   empty items, non-numbers and out-of-range values are dropped.
 */
export const parseFilterQueryParam = (value: string | null, key: FilterKey): number[] | null => {
  if (value === null) return null;

  const { min, max } = FILTER_DEFINITIONS[key];
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => /^\d+$/.test(item))
    .map(Number)
    .filter((item) => item >= min && item <= max);

  return Array.from(new Set(parsed)).sort((a, b) => a - b);
};

/** Returns null when the selection is the full range (the parameter should be omitted). */
export const serializeFilterQueryParam = (values: number[], key: FilterKey): string | null => {
  const { min, max } = FILTER_DEFINITIONS[key];
  const valid = Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value >= min && value <= max))
  ).sort((a, b) => a - b);

  if (valid.length === max - min + 1) return null;
  return valid.join(',');
};

export const readFiltersFromQuery = (params: URLSearchParams): FilterOptions => {
  const defaults = createDefaultFilters();
  return FILTER_KEYS.reduce<FilterOptions>((filters, key) => {
    filters[key] = parseFilterQueryParam(params.get(FILTER_DEFINITIONS[key].queryParam), key) ?? defaults[key];
    return filters;
  }, defaults);
};

export const writeFiltersToQuery = (params: URLSearchParams, filters: FilterOptions) => {
  FILTER_KEYS.forEach((key) => {
    const serialized = serializeFilterQueryParam(filters[key] ?? fullFilterRange(key), key);
    if (serialized === null) {
      params.delete(FILTER_DEFINITIONS[key].queryParam);
    } else {
      params.set(FILTER_DEFINITIONS[key].queryParam, serialized);
    }
  });
};

const AVERAGING_QUERY_VALUES: AveragingOption[] = ['hourly', 'daily', 'weekly', 'monthly', 'daily-cycle'];

export const parseAveragingQueryParam = (value: string | null): AveragingOption | null =>
  AVERAGING_QUERY_VALUES.includes(value as AveragingOption) ? (value as AveragingOption) : null;
