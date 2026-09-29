import { describe, expect, it } from 'vitest';
import { downsampleMinMax } from './chart-downsample';

describe('downsampleMinMax', () => {
  it('returns the input unchanged when it is small enough', () => {
    const data = [1, 2, 3];
    expect(downsampleMinMax(data, 10, (value) => [value])).toBe(data);
  });

  it('keeps every bucket peak and trough regardless of their position', () => {
    // One year of hourly data with a daily peak at a varying hour.
    const data = Array.from({ length: 8760 }, (_, index) => {
      const day = Math.floor(index / 24);
      const hour = index % 24;
      const peakHour = day % 24;
      return { index, value: hour === peakHour ? 1000 + day : hour === (peakHour + 12) % 24 ? -500 - day : 50 };
    });

    const reduced = downsampleMinMax(data, 3000, (item) => [item.value]);

    expect(reduced.length).toBeLessThanOrEqual(3002);
    expect(reduced[0]).toBe(data[0]);
    expect(reduced[reduced.length - 1]).toBe(data[data.length - 1]);
    // Time order preserved.
    for (let i = 1; i < reduced.length; i++) {
      expect(reduced[i].index).toBeGreaterThan(reduced[i - 1].index);
    }
    // Global extremes survive.
    expect(Math.max(...reduced.map((item) => item.value))).toBe(1000 + 364);
    expect(Math.min(...reduced.map((item) => item.value))).toBe(-500 - 364);
    // Every daily peak survives (buckets are smaller than a day here).
    const peaks = reduced.filter((item) => item.value >= 1000);
    expect(peaks).toHaveLength(365);
  });

  it('preserves extremes of every series for multi-series data', () => {
    const data = Array.from({ length: 5000 }, (_, index) => ({
      a: index === 1234 ? 999 : 0,
      b: index === 4321 ? -999 : 0,
    }));
    const reduced = downsampleMinMax(data, 1000, (item) => [item.a, item.b]);

    expect(reduced.length).toBeLessThanOrEqual(1002);
    expect(reduced.some((item) => item.a === 999)).toBe(true);
    expect(reduced.some((item) => item.b === -999)).toBe(true);
  });
});
