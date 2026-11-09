import { describe, expect, it } from 'vitest';
import type { EnergyPrice } from '@/types/energy-data';
import {
  initialPriceDataState,
  isPriceDataBusy,
  PriceDataState,
  PriceSeries,
  priceDataErrors,
  priceDataReducer,
  shownPriceResolution,
  shownPriceSeries,
} from './price-data-state';

const prices = (price: number): EnergyPrice[] => [{ timestamp: '2026-01-01T00:00:00Z', price, unit: 'EUR_MWh' }];
const at = prices(1);
const fr = prices(2);

const ready = (series: PriceSeries = { at }, resolution: 'hourly' | 'interval' = 'hourly'): PriceDataState =>
  priceDataReducer(initialPriceDataState, { type: 'settled', resolution, series, errors: {} });

describe('price data state machine', () => {
  it('starts loading and becomes ready once prices arrive', () => {
    expect(initialPriceDataState.status).toBe('loading');
    expect(isPriceDataBusy(initialPriceDataState)).toBe(true);

    const state = ready();
    expect(state.status).toBe('ready');
    expect(shownPriceSeries(state)).toEqual({ at });
    expect(isPriceDataBusy(state)).toBe(false);
  });

  it('becomes error when no requested region has prices', () => {
    const state = priceDataReducer(initialPriceDataState, {
      type: 'settled', resolution: 'hourly', series: {}, errors: { at: 'failed' },
    });
    expect(state).toEqual({ status: 'error', errors: { at: 'failed' } });
    expect(shownPriceSeries(state)).toEqual({});
    expect(priceDataErrors(state)).toEqual({ at: 'failed' });
  });

  it('treats a partial failure as ready with errors', () => {
    const state = priceDataReducer(initialPriceDataState, {
      type: 'settled', resolution: 'hourly', series: { at }, errors: { fr: 'failed' },
    });
    expect(state.status).toBe('ready');
    expect(priceDataErrors(state)).toEqual({ fr: 'failed' });
  });

  it('treats an empty request as ready, not as an error', () => {
    const state = priceDataReducer(initialPriceDataState, { type: 'settled', resolution: 'hourly', series: {}, errors: {} });
    expect(state.status).toBe('ready');
  });

  it('keeps the old-resolution prices on screen while another resolution loads', () => {
    const state = priceDataReducer(ready(), { type: 'load', regionCodes: ['at'] });
    expect(state.status).toBe('refreshing');
    expect(shownPriceSeries(state)).toEqual({ at });
    // The chart is told what the prices on screen are, not what was just selected.
    expect(shownPriceResolution(state, 'interval')).toBe('hourly');
    expect(isPriceDataBusy(state)).toBe(true);
  });

  it('never keeps another region\'s prices on screen', () => {
    const state = priceDataReducer(ready({ at }), { type: 'load', regionCodes: ['fr'] });
    expect(state).toEqual({ status: 'loading' });
  });

  it('drops deselected regions while the rest refreshes', () => {
    const state = priceDataReducer(ready({ at, fr }), { type: 'load', regionCodes: ['fr'] });
    expect(shownPriceSeries(state)).toEqual({ fr });
  });

  it('hides errors of the previous load while refreshing', () => {
    const partial = priceDataReducer(initialPriceDataState, {
      type: 'settled', resolution: 'hourly', series: { at }, errors: { fr: 'failed' },
    });
    const state = priceDataReducer(partial, { type: 'load', regionCodes: ['at', 'fr'] });
    expect(priceDataErrors(state)).toEqual({});
  });

  it('reloads from scratch after an error', () => {
    const failed = priceDataReducer(initialPriceDataState, {
      type: 'settled', resolution: 'hourly', series: {}, errors: { at: 'failed' },
    });
    expect(priceDataReducer(failed, { type: 'load', regionCodes: ['at'] })).toEqual({ status: 'loading' });
  });

  it('falls back to the requested resolution when nothing is shown', () => {
    expect(shownPriceResolution(initialPriceDataState, 'interval')).toBe('interval');
  });
});
