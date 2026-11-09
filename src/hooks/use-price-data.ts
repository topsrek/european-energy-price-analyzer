import { useCallback, useEffect, useReducer, useState } from 'react';
import type { RegionConfig } from '@/config/regions';
import type { DataResolution, EnergyPrice } from '@/types/energy-data';
import { getLatestTimestamp } from '@/utils/data-utils';
import { fetchOptimizedBinaryPriceData } from '@/utils/optimized-binary-decoder';
import { MissingPriceFileError, priceLoadErrorMessage } from '@/utils/price-load-error';
import {
  initialPriceDataState,
  PriceErrors,
  PriceSeries,
  priceDataReducer,
} from '@/utils/price-data-state';

interface CachedPrices {
  data: EnergyPrice[];
  latestTimestamp: string;
}

// Shared by all pages, so switching between a country and the comparison reuses downloads.
// Keyed by region + resolution so data of one region is never shown for another.
const priceCache = new Map<string, CachedPrices>();
const cacheKey = (region: RegionConfig, resolution: DataResolution) => `${region.code}:${resolution}`;

/** For tests. */
export const clearPriceDataCache = () => priceCache.clear();

const getDataBaseUrl = () => (import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/$/, '');

/** Asks the worker whether cached prices are behind the server; any failure counts as fresh. */
const isCachedDataFresh = async (region: RegionConfig, resolution: DataResolution, latestTimestamp: string) => {
  try {
    const response = await fetch(`${getDataBaseUrl()}/api/data-freshness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: region.marketCode, resolution, latestTimestamp }),
    });
    if (!response.ok) return true;
    const payload = await response.json();
    return payload.fresh !== false;
  } catch {
    return true;
  }
};

const loadRegionPrices = async (region: RegionConfig, resolution: DataResolution) => {
  const cached = priceCache.get(cacheKey(region, resolution));
  if (cached) return cached.data;

  const path = resolution === 'interval' ? region.dataFiles.interval : region.dataFiles.hourly;
  if (!path) throw new MissingPriceFileError();

  const data = await fetchOptimizedBinaryPriceData(`${getDataBaseUrl()}${path}`, {
    intervalMinutes: resolution === 'interval' ? 15 : 60,
  });
  priceCache.set(cacheKey(region, resolution), { data, latestTimestamp: getLatestTimestamp(data) });
  return data;
};

/**
 * Loads all regions in parallel; one failing region does not block the others.
 * A failed region keeps its `fallback` prices (older data) when there are any.
 */
const loadAllRegionPrices = async (regions: RegionConfig[], resolution: DataResolution, fallback: PriceSeries = {}) => {
  const series: PriceSeries = {};
  const errors: PriceErrors = {};
  await Promise.all(regions.map(async (region) => {
    try {
      series[region.code] = await loadRegionPrices(region, resolution);
    } catch (error) {
      console.warn(`Failed to load ${region.code} ${resolution} price data:`, error);
      errors[region.code] = priceLoadErrorMessage(error, region, resolution === 'interval');
      const older = fallback[region.code];
      if (older) series[region.code] = older;
    }
  }));
  return { series, errors };
};

/**
 * Price datasets for `regions` (pass a memoized array) at `resolution`, as the explicit
 * state machine in `price-data-state.ts`. Cached datasets show at once and are refreshed
 * in the background if the worker reports newer data.
 */
export const usePriceData = (regions: RegionConfig[], resolution: DataResolution) => {
  const [state, dispatch] = useReducer(priceDataReducer, initialPriceDataState);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    let active = true;
    const regionCodes = regions.map((region) => region.code);
    const fromCache = regions.filter((region) => priceCache.has(cacheKey(region, resolution)));

    const run = async () => {
      if (fromCache.length < regions.length) dispatch({ type: 'load', regionCodes });
      const result = await loadAllRegionPrices(regions, resolution);
      if (!active) return;
      dispatch({ type: 'settled', resolution, ...result });

      // Only one refresh pass, for stale cache entries, without re-checking freshness (no loop).
      const freshness = await Promise.all(fromCache.map(async (region) => {
        const cached = priceCache.get(cacheKey(region, resolution));
        return { region, fresh: !cached || await isCachedDataFresh(region, resolution, cached.latestTimestamp) };
      }));
      const stale = freshness.filter(({ fresh }) => !fresh).map(({ region }) => region);
      if (!active || stale.length === 0) return;

      stale.forEach((region) => priceCache.delete(cacheKey(region, resolution)));
      dispatch({ type: 'load', regionCodes });
      const refreshed = await loadAllRegionPrices(regions, resolution, result.series);
      if (active) dispatch({ type: 'settled', resolution, ...refreshed });
    };

    void run();
    return () => {
      active = false;
    };
  }, [regions, resolution, attempt]);

  return { state, retry };
};
