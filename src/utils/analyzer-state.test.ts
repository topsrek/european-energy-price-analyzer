import { describe, expect, it } from 'vitest';
import { parseQueryNumber } from './analyzer-state';

describe('parseQueryNumber', () => {
  it('accepts German decimal input for chart bounds', () => {
    expect(parseQueryNumber('12,5')).toBe(12.5);
  });
});
