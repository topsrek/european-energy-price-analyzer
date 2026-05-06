import { RegionCode } from '@/config/regions';
import { DataResolution, EnergyPrice } from '@/types/energy-data';

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

  try {
    const storedValue = window.localStorage.getItem(DATA_RESOLUTION_STORAGE_KEY);
    if (isDataResolution(storedValue)) return storedValue;
  } catch {
    // Ignore storage access failures and fall back to defaults.
  }

  return DEFAULT_DATA_RESOLUTION;
};

export const readInitialPriceUnit = (): PriceUnit => {
  if (typeof window === 'undefined') return DEFAULT_PRICE_UNIT;

  const params = new URLSearchParams(window.location.search);
  const queryValue = parseUnitQueryParam(params.get('unit'));
  if (queryValue) return queryValue;

  try {
    const storedValue = window.localStorage.getItem(PRICE_UNIT_STORAGE_KEY);
    if (isPriceUnit(storedValue)) return storedValue;
  } catch {
    // Ignore storage access failures and fall back to defaults.
  }

  return DEFAULT_PRICE_UNIT;
};

export const parseQueryNumber = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number(value);
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
