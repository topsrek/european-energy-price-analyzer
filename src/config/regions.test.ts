import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultRegion,
  detectRegionFromGeoIp,
  getRegionByCode,
  getStoredRegion,
  guessRegionFromBrowser,
  REGION_STORAGE_KEY,
  saveSelectedRegion,
} from './regions';

describe('regions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('resolves known country routes', () => {
    expect(getRegionByCode('at')?.appCode).toBe('EEPA-AT');
    expect(getRegionByCode('AT')?.appCode).toBe('EEPA-AT');
    expect(getRegionByCode('unknown')).toBeUndefined();
  });

  it('stores and reads the selected region', () => {
    saveSelectedRegion('at');
    expect(localStorage.getItem(REGION_STORAGE_KEY)).toBe('at');
    expect(getStoredRegion()?.code).toBe('at');
  });

  it('falls back to the default region from browser data', () => {
    expect(guessRegionFromBrowser()).toEqual(defaultRegion);
  });

  it('detects a region from a configured GeoIP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ country_code: 'AT' }),
    })));

    const detected = await detectRegionFromGeoIp('/geoip.json');
    expect(detected?.code).toBe('at');
  });
});
