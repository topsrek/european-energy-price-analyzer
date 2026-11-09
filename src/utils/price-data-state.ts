import type { RegionCode } from '@/config/regions';
import type { DataResolution, EnergyPrice } from '@/types/energy-data';

export type PriceSeries = Partial<Record<RegionCode, EnergyPrice[]>>;
export type PriceErrors = Partial<Record<RegionCode, string>>;

/** Prices on screen, with the resolution they were loaded at (which may lag the selected one). */
export interface ShownPrices {
  resolution: DataResolution;
  series: PriceSeries;
  /** Regions that failed in the last load; their series may hold older data or be missing. */
  errors: PriceErrors;
}

/**
 * Loading of the price datasets for a set of regions at one resolution.
 *
 *   loading    --settled-->  ready | error
 *   ready      --load----->  refreshing (if a requested region is on screen) | loading
 *   refreshing --settled-->  ready | error
 *   error      --load----->  loading
 *
 * `refreshing` keeps the prices of regions that are still requested on screen, so a
 * resolution switch or background refresh never blanks the chart, and another region's
 * prices are never shown under a different region's name.
 * `error` means no requested region has prices; a partial failure is `ready` with `errors`.
 */
export type PriceDataState =
  | { status: 'loading' }
  | { status: 'refreshing'; shown: ShownPrices }
  | { status: 'ready'; shown: ShownPrices }
  | { status: 'error'; errors: PriceErrors };

export type PriceDataEvent =
  | { type: 'load'; regionCodes: RegionCode[] }
  | { type: 'settled'; resolution: DataResolution; series: PriceSeries; errors: PriceErrors };

export const initialPriceDataState: PriceDataState = { status: 'loading' };

const hasEntries = (record: object) => Object.keys(record).length > 0;

const pickSeries = (series: PriceSeries, regionCodes: RegionCode[]): PriceSeries => {
  const picked: PriceSeries = {};
  regionCodes.forEach((code) => {
    const prices = series[code];
    if (prices) picked[code] = prices;
  });
  return picked;
};

export const priceDataReducer = (state: PriceDataState, event: PriceDataEvent): PriceDataState => {
  switch (event.type) {
    case 'load': {
      if (state.status !== 'ready' && state.status !== 'refreshing') return { status: 'loading' };
      const kept = pickSeries(state.shown.series, event.regionCodes);
      return hasEntries(kept)
        ? { status: 'refreshing', shown: { resolution: state.shown.resolution, series: kept, errors: {} } }
        : { status: 'loading' };
    }
    case 'settled':
      // Nothing requested (no errors either) is an empty but valid result.
      return hasEntries(event.series) || !hasEntries(event.errors)
        ? { status: 'ready', shown: { resolution: event.resolution, series: event.series, errors: event.errors } }
        : { status: 'error', errors: event.errors };
  }
};

const EMPTY_SERIES: PriceSeries = {};
const EMPTY_ERRORS: PriceErrors = {};

/** Prices to draw; empty while loading or failed. Stable references for unchanged states. */
export const shownPriceSeries = (state: PriceDataState): PriceSeries =>
  state.status === 'ready' || state.status === 'refreshing' ? state.shown.series : EMPTY_SERIES;

export const priceDataErrors = (state: PriceDataState): PriceErrors =>
  state.status === 'error' ? state.errors : state.status === 'ready' ? state.shown.errors : EMPTY_ERRORS;

/** Resolution of the prices on screen, or `fallback` when none are shown. */
export const shownPriceResolution = (state: PriceDataState, fallback: DataResolution): DataResolution =>
  state.status === 'ready' || state.status === 'refreshing' ? state.shown.resolution : fallback;

export const isPriceDataBusy = (state: PriceDataState) =>
  state.status === 'loading' || state.status === 'refreshing';
