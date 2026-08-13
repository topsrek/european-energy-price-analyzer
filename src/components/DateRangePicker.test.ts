import { describe, expect, it } from 'vitest';
import { setRangeEndpoint } from './DateRangePicker';

describe('setRangeEndpoint', () => {
  it('changes the requested end without resetting the start', () => {
    const range = setRangeEndpoint(
      { from: new Date(2026, 7, 1), to: new Date(2026, 7, 12) },
      'to',
      new Date(2026, 7, 14),
    );

    expect(range.from).toEqual(new Date(2026, 7, 1));
    expect(range.to).toEqual(new Date(2026, 7, 14));
  });

  it('keeps a valid range when the start moves past the old end', () => {
    const range = setRangeEndpoint(
      { from: new Date(2026, 7, 1), to: new Date(2026, 7, 12) },
      'from',
      new Date(2026, 7, 14),
    );

    expect(range.from).toEqual(new Date(2026, 7, 14));
    expect(range.to).toEqual(new Date(2026, 7, 14));
  });
});
