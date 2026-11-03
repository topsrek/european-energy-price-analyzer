import type { RegionConfig } from '@/config/regions';

export const priceLoadErrorMessage = (error: unknown, region: RegionConfig, interval: boolean): string => {
  // The binary loader wraps HTTP errors with a cause; preserve that distinction here.
  if (error instanceof Error && /HTTP error! status: 404\b/.test(error.message)) {
    return interval
      ? `Für ${region.localName} wurde noch keine 15-Minuten-Preisdatei gefunden.`
      : `Für ${region.localName} wurde keine aktuelle Preisdatei gefunden.`;
  }
  return `Verbindung fehlgeschlagen: Preisdaten für ${region.localName} konnten nicht geladen werden.`;
};
