import { safeStorageGetItem, safeStorageSetItem } from '@/lib/safe-storage';

export type RegionCode = 'at' | 'de-lu' | 'fr';

export interface RegionDataFiles {
  hourly: string;
  interval?: string;
}

export interface RegionConfig {
  code: RegionCode;
  marketCode: string;
  geoCountryCodes: string[];
  flagCodes: string[];
  path: string;
  appCode: string;
  countryName: string;
  localName: string;
  title: string;
  description: string;
  language: string;
  timezone: string;
  market: string;
  dataStatus: 'available' | 'planned';
  dataFiles: RegionDataFiles;
  chartColor: string;
}

export const REGION_STORAGE_KEY = 'eepa.selectedRegion';

export const regions: RegionConfig[] = [
  {
    code: 'at',
    marketCode: 'AT',
    geoCountryCodes: ['AT'],
    flagCodes: ['AT'],
    path: '/at',
    appCode: 'EEPA-AT',
    countryName: 'Austria',
    localName: 'Österreich',
    title: 'Strompreisrechner Österreich',
    description: 'Historische Strompreise in Österreich analysieren und mit Verbrauchsmustern vergleichen.',
    language: 'de-AT',
    timezone: 'Europe/Vienna',
    market: 'Day-ahead electricity prices',
    dataStatus: 'available',
    chartColor: '#e11d48',
    dataFiles: {
      hourly: '/api/at_electricity_prices.bin',
      interval: '/api/at_electricity_prices_15min.bin',
    },
  },
  {
    code: 'de-lu',
    marketCode: 'DE-LU',
    geoCountryCodes: ['DE', 'LU'],
    flagCodes: ['DE', 'LU'],
    path: '/de-lu',
    appCode: 'EEPA-DE-LU',
    countryName: 'Germany & Luxembourg',
    localName: 'Deutschland & Luxemburg',
    title: 'Strompreisrechner Deutschland & Luxemburg',
    description: 'Historische Day-ahead-Strompreise der gemeinsamen DE-LU-Preiszone analysieren und direkt mit anderen Regionen vergleichen.',
    language: 'de-DE',
    timezone: 'Europe/Berlin',
    market: 'Day-ahead electricity prices',
    dataStatus: 'available',
    chartColor: '#2563eb',
    dataFiles: {
      hourly: '/api/de-lu_electricity_prices.bin',
      interval: '/api/de-lu_electricity_prices_15min.bin',
    },
  },
  {
    code: 'fr',
    marketCode: 'FR',
    geoCountryCodes: ['FR'],
    flagCodes: ['FR'],
    path: '/fr',
    appCode: 'EEPA-FR',
    countryName: 'France',
    localName: 'France',
    title: 'Strompreisrechner Frankreich',
    description: 'Historische Day-ahead-Strompreise in Frankreich analysieren und mit anderen europäischen Regionen vergleichen.',
    language: 'fr-FR',
    timezone: 'Europe/Paris',
    market: 'Day-ahead electricity prices',
    dataStatus: 'available',
    chartColor: '#0f766e',
    dataFiles: {
      hourly: '/api/fr_electricity_prices.bin',
      interval: '/api/fr_electricity_prices_15min.bin',
    },
  },
];

const regionByCountryCode = new Map(
  regions.flatMap((region) => region.geoCountryCodes.map((countryCode) => [countryCode, region] as const))
);

export const defaultRegion = regions[0];

export const getRegionByCode = (code: string | undefined): RegionConfig | undefined => {
  if (!code) return undefined;
  return regions.find((region) => region.code === code.toLowerCase());
};

export const saveSelectedRegion = (code: RegionCode) => {
  safeStorageSetItem(REGION_STORAGE_KEY, code);
};

export const getStoredRegion = (): RegionConfig | undefined => {
  const stored = safeStorageGetItem(REGION_STORAGE_KEY);
  return getRegionByCode(stored ?? undefined);
};

const countryFromLocale = () => {
  for (const locale of navigator.languages ?? [navigator.language]) {
    const match = locale.match(/-([A-Z]{2})$/i);
    if (match) return match[1].toUpperCase();
  }
  return undefined;
};

const countryFromTimezone = () => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timezone === 'Europe/Vienna') return 'AT';
  if (timezone === 'Europe/Berlin') return 'DE';
  if (timezone === 'Europe/Paris') return 'FR';
  return undefined;
};

export const guessRegionFromBrowser = (): RegionConfig => {
  const countryCode = countryFromLocale() ?? countryFromTimezone();
  return (countryCode && regionByCountryCode.get(countryCode)) || defaultRegion;
};

export const getInitialRegion = () => getStoredRegion() ?? guessRegionFromBrowser();

export const detectRegionFromGeoIp = async (
  endpoint = import.meta.env.VITE_GEOIP_ENDPOINT ?? '/api/geoip'
): Promise<RegionConfig | undefined> => {
  if (!endpoint) return undefined;

  try {
    const response = await fetch(endpoint, { credentials: 'omit' });
    if (!response.ok) return undefined;

    const payload = await response.json();
    const countryCode = String(payload.country_code ?? payload.countryCode ?? payload.country ?? '').toUpperCase();
    return regionByCountryCode.get(countryCode);
  } catch {
    return undefined;
  }
};
