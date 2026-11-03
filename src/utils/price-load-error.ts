import type { RegionConfig } from '@/config/regions';

export const priceLoadErrorMessage = (error: unknown, region: RegionConfig, interval: boolean): string => {
  // The binary loader wraps HTTP errors with a cause; preserve that distinction here.
  if (error instanceof Error && /HTTP error! status: 404\b/.test(error.message)) {
    return interval
      ? `F?r ${region.localName} wurde noch keine 15-Minuten-Preisdatei gefunden.`
      : `F?r ${region.localName} wurde keine aktuelle Preisdatei gefunden.`;
  }
  return `Verbindung fehlgeschlagen: Preisdaten f?r ${region.localName} konnten nicht geladen werden.`;
};
