import { afterEach, expect, it, vi } from 'vitest';
import { guessRegionFromBrowser } from './regions';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('uses Berlin timezone when browser locale is unsupported', () => {
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Europe/Berlin' } as Intl.ResolvedDateTimeFormatOptions);
  expect(guessRegionFromBrowser().code).toBe('de-lu');
});
