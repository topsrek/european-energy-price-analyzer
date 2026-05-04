export type RegionCode = 'at';

export interface RegionConfig {
  code: RegionCode;
  countryCode: string;
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
}

export const REGION_STORAGE_KEY = 'eepa.selectedRegion';

export const regions: RegionConfig[] = [
  {
    code: 'at',
    countryCode: 'AT',
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
  },
];

const regionByCountryCode = new Map(regions.map((region) => [region.countryCode, region]));

export const defaultRegion = regions[0];

export const getRegionByCode = (code: string | undefined): RegionConfig | undefined => {
  if (!code) return undefined;
  return regions.find((region) => region.code === code.toLowerCase());
};

export const saveSelectedRegion = (code: RegionCode) => {
  localStorage.setItem(REGION_STORAGE_KEY, code);
};

export const getStoredRegion = (): RegionConfig | undefined => {
  const stored = localStorage.getItem(REGION_STORAGE_KEY);
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
  return undefined;
};

export const guessRegionFromBrowser = (): RegionConfig => {
  const countryCode = countryFromLocale() ?? countryFromTimezone();
  return (countryCode && regionByCountryCode.get(countryCode)) || defaultRegion;
};

export const getInitialRegion = () => getStoredRegion() ?? guessRegionFromBrowser();

export const detectRegionFromGeoIp = async (
  endpoint = import.meta.env.VITE_GEOIP_ENDPOINT
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
