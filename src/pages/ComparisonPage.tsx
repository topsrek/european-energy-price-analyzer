import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import ComparisonInfoModal from '@/components/ComparisonInfoModal';
import DateRangePicker from '@/components/DateRangePicker';
import AveragingOptions from '@/components/AveragingOptions';
import FilterOptions from '@/components/FilterOptions';
import EnergyChart from '@/components/EnergyChart';
import ControlMenu from '@/components/ControlMenu';
import ContactModal from '@/components/ContactModal';
import VersionInfo from '@/components/VersionInfo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { ArrowUpDown, LineChart, SlidersHorizontal } from 'lucide-react';
import { ComparisonSeries, DataResolution, EnergyPrice, FilterOptions as FilterOptionsType, AveragingOption } from '@/types/energy-data';
import { RegionCode, regions } from '@/config/regions';
import {
  applyFilters,
  calculateAverage,
  convertEnergyPriceUnit,
  convertPriceValue,
  filterByDateRange,
  getLatestTimestamp,
  getTimestampBounds,
} from '@/utils/data-utils';
import { fetchOptimizedBinaryPriceData } from '@/utils/optimized-binary-decoder';
import { getActiveQuickRangePreset, getQuickRangeDates } from '@/utils/date-range-presets';
import { formatLocalDateForQuery, parseLocalDateFromQuery } from '@/utils/local-date';
import {
  DATA_RESOLUTION_STORAGE_KEY,
  PRICE_UNIT_STORAGE_KEY,
  PriceUnit,
  createDefaultFilters,
  parseAveragingQueryParam,
  parseQueryNumber,
  parseRegionCodesQueryParam,
  readFiltersFromQuery,
  readInitialDataResolution,
  readInitialPriceUnit,
  serializeOptionalNumber,
  serializeResolutionQueryParam,
  serializeUnitQueryParam,
  writeFiltersToQuery,
} from '@/utils/analyzer-state';
import { CheckedState } from '@radix-ui/react-checkbox';
import { safeStorageSetItem } from '@/lib/safe-storage';
import { getMarketCalendarDay, MARKET_TIMEZONE } from '@/utils/market-time';

interface CachedPriceData {
  data: EnergyPrice[];
  latestTimestamp: string;
}

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

const getDataBaseUrl = () => import.meta.env.VITE_DATA_BASE_URL ?? '';

const isCachedDataFresh = async (
  marketCode: string,
  resolution: DataResolution,
  latestTimestamp: string
) => {
  try {
    const dataBaseUrl = getDataBaseUrl().replace(/\/$/, '');
    const response = await fetch(`${dataBaseUrl}/api/data-freshness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode: marketCode,
        resolution,
        latestTimestamp,
      }),
    });

    if (!response.ok) return true;

    const payload = await response.json();
    return payload.fresh !== false;
  } catch {
    return true;
  }
};

const availableRegions = regions.filter((region) => region.dataStatus === 'available');

const readInitialSelectedRegions = (): RegionCode[] => {
  if (typeof window === 'undefined') return availableRegions.map((region) => region.code);

  const params = new URLSearchParams(window.location.search);
  const fromQuery = parseRegionCodesQueryParam(
    params.get('regions'),
    availableRegions.map((region) => region.code)
  );

  if (fromQuery.length > 0) {
    return fromQuery;
  }

  return availableRegions.map((region) => region.code);
};

const ComparisonPage = () => {

  const [selectedRegionCodes, setSelectedRegionCodes] = useState<RegionCode[]>(readInitialSelectedRegions);

  const [startDate, setStartDate] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return parseLocalDateFromQuery(params.get('start'));
  });
  // Without an explicit end date we default to the latest available day once data is loaded.
  const [endDate, setEndDate] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return parseLocalDateFromQuery(params.get('end'));
  });
  const [isAveragingEnabled, setIsAveragingEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return parseAveragingQueryParam(new URLSearchParams(window.location.search).get('avg')) !== null;
  });
  const [averaging, setAveraging] = useState<AveragingOption>(() => {
    if (typeof window === 'undefined') return 'daily-cycle';
    return parseAveragingQueryParam(new URLSearchParams(window.location.search).get('avg')) ?? 'daily-cycle';
  });
  
  const [filters, setFilters] = useState<FilterOptionsType>(() => {
    if (typeof window === 'undefined') return createDefaultFilters();
    return readFiltersFromQuery(new URLSearchParams(window.location.search));
  });

  const [isLoadingPriceData, setIsLoadingPriceData] = useState(true);
  const [dataResolution, setDataResolution] = useState<DataResolution>(readInitialDataResolution);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(readInitialPriceUnit);
  const [showZeroLine, setShowZeroLine] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('z') === '1';
  });

  const [showAverageLine, setShowAverageLine] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('a') === '1';
  });

  const [yMinInput, setYMinInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('yMin') ?? '';
  });

  const [yMaxInput, setYMaxInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('yMax') ?? '';
  });
  const [isYMinAuto, setIsYMinAuto] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !new URLSearchParams(window.location.search).has('yMin');
  });
  const [isYMaxAuto, setIsYMaxAuto] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !new URLSearchParams(window.location.search).has('yMax');
  });
  const [autoYDomain, setAutoYDomain] = useState<[number, number] | null>(null);

  const [cutoffEnabled, setCutoffEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('c') === '1';
  });

  const [cutoffValue, setCutoffValue] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return parseQueryNumber(new URLSearchParams(window.location.search).get('cv'));
  });
  // Raw text of the ruler input so partial input such as "8.", "-" or "8," can be typed.
  const [cutoffInput, setCutoffInput] = useState<string>(() =>
    cutoffValue === null ? '' : String(cutoffValue)
  );
  const [showDelta, setShowDelta] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('delta') === '1';
  });
  const [seriesByRegion, setSeriesByRegion] = useState<Partial<Record<RegionCode, EnergyPrice[]>>>({});
  const [seriesErrors, setSeriesErrors] = useState<Partial<Record<RegionCode, string>>>({});
  const [earliestAvailableDate, setEarliestAvailableDate] = useState<Date | null>(null);
  const [latestAvailableDate, setLatestAvailableDate] = useState<Date | null>(null);
  const cacheRef = useRef<Partial<Record<DataResolution, Partial<Record<RegionCode, CachedPriceData>>>>>({});
  const startDateRef = useRef<Date | null>(startDate);
  const endDateRef = useRef<Date | null>(endDate);

  const yMin = isYMinAuto ? null : parseQueryNumber(yMinInput);
  const yMax = isYMaxAuto ? null : parseQueryNumber(yMaxInput);
  const handleAutoYDomainChange = useCallback((domain: [number, number]) => {
    setAutoYDomain((current) => current?.[0] === domain[0] && current[1] === domain[1] ? current : domain);
  }, []);

  useEffect(() => {
    if (isYMinAuto && autoYDomain) setYMinInput(autoYDomain[0].toFixed(2));
    if (isYMaxAuto && autoYDomain) setYMaxInput(autoYDomain[1].toFixed(2));
  }, [autoYDomain, isYMaxAuto, isYMinAuto]);
  const selectedRegions = useMemo(
    () => availableRegions.filter((region) => selectedRegionCodes.includes(region.code)),
    [selectedRegionCodes]
  );

  const displayedSeries = useMemo<ComparisonSeries[]>(() => {
    const baseSeries = selectedRegions
      .map((region) => {
        const rawSeries = seriesByRegion[region.code] ?? [];
        if (!rawSeries.length) return null;

        let filteredData = convertEnergyPriceUnit(
          filterByDateRange(rawSeries, startDate, endDate, MARKET_TIMEZONE),
          priceUnit
        );
        if (isAveragingEnabled) {
          filteredData = applyFilters(filteredData, filters, MARKET_TIMEZONE, averaging);
        }

        const processed = isAveragingEnabled ? calculateAverage(filteredData, averaging, MARKET_TIMEZONE) : filteredData;
        const series: ComparisonSeries = {
          id: region.code,
          label: region.localName,
          shortLabel: region.appCode.replace('EEPA-', ''),
          color: region.chartColor,
          energyPrices: processed,
        };
        return series;
      })
      .filter((series): series is ComparisonSeries => series !== null);

    if (showDelta && baseSeries.length >= 2) {
      const [seriesA, ...others] = baseSeries;
      
      return [
        seriesA,
        ...others.map(seriesB => {
          const deltaPrices: EnergyPrice[] = [];
          const mapA = new Map<string, number>(
            seriesA.energyPrices.map((p) => [p.timestamp, p.price])
          );
          
          seriesB.energyPrices.forEach(pB => {
            const pA = mapA.get(pB.timestamp);
            if (pA !== undefined) {
              deltaPrices.push({
                ...pB,
                price: pB.price - pA
              });
            }
          });

          return {
            ...seriesB,
            label: `${seriesB.label} - ${seriesA.shortLabel}`,
            energyPrices: deltaPrices,
          };
        })
      ];
    }

    return baseSeries;
  }, [averaging, endDate, filters, isAveragingEnabled, priceUnit, selectedRegions, seriesByRegion, startDate, showDelta]);

  const handleCheckedChange =
    (setter: Dispatch<SetStateAction<boolean>>) => (checked: CheckedState) => {
      setter(checked === true);
    };

  const activeRangePreset = getActiveQuickRangePreset(
    startDate,
    endDate,
    latestAvailableDate,
    earliestAvailableDate
  );
  const footerSummary = selectedRegions.length
    ? `${selectedRegions.map((region) => region.appCode).join(', ')} · ${dataResolution === 'interval' ? '15 Minuten' : 'Stündlich'}`
    : 'Keine Region ausgewählt';

  useEffect(() => {
    document.documentElement.lang = 'de';
    document.title = 'Strompreisvergleich Europa - EEPA';
  }, []);


  useEffect(() => {
    startDateRef.current = startDate;
    endDateRef.current = endDate;
  }, [endDate, startDate]);

  useEffect(() => {
    safeStorageSetItem(DATA_RESOLUTION_STORAGE_KEY, dataResolution);
    safeStorageSetItem(PRICE_UNIT_STORAGE_KEY, priceUnit);

    const params = new URLSearchParams(window.location.search);
    params.set('resolution', serializeResolutionQueryParam(dataResolution));
    params.set('unit', serializeUnitQueryParam(priceUnit));
    params.set('regions', selectedRegionCodes.join(','));

    const serializedYMin = serializeOptionalNumber(yMin);
    const serializedYMax = serializeOptionalNumber(yMax);

    if (serializedYMin === null) params.delete('yMin');
    else params.set('yMin', serializedYMin);

    if (serializedYMax === null) params.delete('yMax');
    else params.set('yMax', serializedYMax);

    // Grid, Cutoff, Delta
    if (showZeroLine) params.set('z', '1'); else params.delete('z');
    if (showAverageLine) params.set('a', '1'); else params.delete('a');
    if (showDelta) params.set('delta', '1'); else params.delete('delta');
    if (cutoffEnabled) {
      params.set('c', '1');
      if (cutoffValue !== null) params.set('cv', cutoffValue.toString());
    } else {
      params.delete('c');
      params.delete('cv');
    }

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [dataResolution, priceUnit, selectedRegionCodes, yMin, yMax, showZeroLine, showAverageLine, showDelta, cutoffEnabled, cutoffValue]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAveragingEnabled) {
      params.set('avg', averaging);
    } else {
      params.delete('avg');
    }
    
    writeFiltersToQuery(params, filters);

    if (startDate) params.set('start', formatLocalDateForQuery(startDate)); else params.delete('start');
    if (endDate) params.set('end', formatLocalDateForQuery(endDate)); else params.delete('end');

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [isAveragingEnabled, averaging, filters, startDate, endDate]);

  useEffect(() => {
    let isMounted = true;

    const getCachedEntry = (regionCode: RegionCode) => cacheRef.current[dataResolution]?.[regionCode];

    const evictCachedEntries = (regionCodes: RegionCode[]) => {
      const resolutionCache = cacheRef.current[dataResolution];
      if (!resolutionCache) return;
      regionCodes.forEach((code) => {
        delete resolutionCache[code];
      });
    };

    /**
     * Loads all selected regions (from cache where possible). On the initial pass
     * cached entries are checked for freshness; stale ones are evicted and a single
     * refresh pass re-fetches only those, without re-checking freshness (no loop).
     */
    const loadAllSelectedRegions = async (isRefresh: boolean) => {
      if (!isRefresh) setIsLoadingPriceData(true);
      const freshnessChecks: Promise<{ code: RegionCode; fresh: boolean }>[] = [];

      try {
        const nextSeries: Partial<Record<RegionCode, EnergyPrice[]>> = {};
        const nextErrors: Partial<Record<RegionCode, string>> = {};

        // Download all missing regions in parallel; one failing region doesn't block the others.
        await Promise.all(selectedRegions.map(async (region) => {
          const cachedEntry = getCachedEntry(region.code);
          if (cachedEntry) {
            nextSeries[region.code] = cachedEntry.data;
            if (!isRefresh) {
              freshnessChecks.push(
                isCachedDataFresh(region.marketCode, dataResolution, cachedEntry.latestTimestamp)
                  .then((fresh) => ({ code: region.code, fresh }))
              );
            }
            return;
          }

          try {
            const binaryPath = dataResolution === 'interval' ? region.dataFiles.interval : region.dataFiles.hourly;
            if (!binaryPath) {
              nextErrors[region.code] = 'Keine Datendatei verfügbar';
              return;
            }

            const dataBaseUrl = getDataBaseUrl();
            const realData = await fetchOptimizedBinaryPriceData(`${dataBaseUrl}${binaryPath}`, {
              intervalMinutes: dataResolution === 'interval' ? 15 : 60,
            });

            nextSeries[region.code] = realData;
            cacheRef.current[dataResolution] = {
              ...(cacheRef.current[dataResolution] ?? {}),
              [region.code]: {
                data: realData,
                latestTimestamp: getLatestTimestamp(realData),
              },
            };
          } catch (error) {
            console.warn(`Failed to load ${region.code} comparison data`, error);
            nextErrors[region.code] =
              dataResolution === 'interval'
                ? `Für ${region.localName} wurde noch keine 15-Minuten-Datei gefunden.`
                : `Für ${region.localName} wurde keine aktuelle Preisdatei gefunden.`;
          }
        }));

        if (!isMounted) return;

        // Replace (not merge) so a region that failed to load at this resolution never keeps
        // showing data of the previous resolution.
        setSeriesByRegion(nextSeries);
        setSeriesErrors(nextErrors);

        let earliest = Infinity;
        let latest = -Infinity;
        let loadedSeriesCount = 0;
        for (const region of selectedRegions) {
          const series = nextSeries[region.code] ?? getCachedEntry(region.code)?.data ?? [];
          const bounds = getTimestampBounds(series);
          if (!bounds) continue;
          loadedSeriesCount += 1;
          earliest = Math.min(earliest, bounds.earliest);
          latest = Math.max(latest, bounds.latest);
        }

        if (loadedSeriesCount > 0) {
          const earliestDay = getMarketCalendarDay(earliest, MARKET_TIMEZONE);
          const latestDay = getMarketCalendarDay(latest, MARKET_TIMEZONE);
          setEarliestAvailableDate(earliestDay);
          setLatestAvailableDate(latestDay);

          if (!startDateRef.current) {
            const defaultRange = getQuickRangeDates('1y', latestDay, earliestDay);
            setStartDate(defaultRange.startDate);
            setEndDate(defaultRange.endDate);
          } else if (!endDateRef.current) {
            setEndDate(latestDay);
          }
        }

        if (Object.keys(nextErrors).length > 0 && loadedSeriesCount === 0) {
          toast({
            title: 'Keine Vergleichsdaten verfügbar',
            description: 'Für die ausgewählten Regionen konnten keine Preisdateien geladen werden.',
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('Failed to prepare comparison data', error);
        if (isMounted) {
          toast({
            title: 'Fehler beim Laden der Vergleichsdaten',
            description: 'Die Preisdaten konnten nicht verarbeitet werden.',
            variant: 'destructive',
          });
        }
      } finally {
        if (isMounted && !isRefresh) setIsLoadingPriceData(false);
      }

      if (freshnessChecks.length === 0) return;

      const results = await Promise.all(freshnessChecks);
      const staleCodes = results.filter((result) => !result.fresh).map((result) => result.code);
      if (!isMounted || staleCodes.length === 0) return;

      evictCachedEntries(staleCodes);
      await loadAllSelectedRegions(true);
    };

    if (selectedRegions.length > 0) {
      void loadAllSelectedRegions(false);
    } else {
      setSeriesByRegion({});
      setSeriesErrors({});
      setIsLoadingPriceData(false);
    }

    return () => {
      isMounted = false;
    };
  }, [dataResolution, selectedRegions]);

  useEffect(() => {
    if (cutoffValue !== null || displayedSeries.length === 0) {
      return;
    }

    const allValues = displayedSeries.flatMap((series) => series.energyPrices.map((item) => item.price));
    if (!allValues.length) return;
    const average = allValues.reduce((sum, value) => sum + value, 0) / allValues.length;
    setCutoffValue(Number(average.toFixed(2)));
  }, [cutoffValue, displayedSeries]);

  // Keep the ruler text in sync when the value changes elsewhere (chart drag,
  // auto-average, unit switch) without clobbering partial input like "8.".
  useEffect(() => {
    setCutoffInput((current) =>
      parseQueryNumber(current) === cutoffValue ? current : cutoffValue === null ? '' : String(cutoffValue)
    );
  }, [cutoffValue]);

  const handlePriceUnitChange = (nextUnit: PriceUnit) => {
    if (nextUnit === priceUnit) return;
    setCutoffValue((current) => (current === null ? null : convertPriceValue(current, priceUnit, nextUnit)));
    // Manual axis limits are in the old unit too.
    const convertLimitInput = (input: string) => {
      const parsed = parseQueryNumber(input);
      return parsed === null ? input : String(convertPriceValue(parsed, priceUnit, nextUnit));
    };
    setYMinInput(convertLimitInput);
    setYMaxInput(convertLimitInput);
    setPriceUnit(nextUnit);
  };

  const handleCutoffInputChange = (value: string) => {
    setCutoffInput(value);
    const parsed = parseQueryNumber(value);
    if (parsed !== null) setCutoffValue(parsed);
  };

  const toggleRegion = (regionCode: RegionCode) => {
    setSelectedRegionCodes((current) => {
      if (current.includes(regionCode)) {
        return current.length === 1 ? current : current.filter((code) => code !== regionCode);
      }
      return [...current, regionCode];
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader title="Strompreisvergleich Europa" isComparison />
      <main className="mx-auto w-full md:container md:px-4 md:pb-4 md:pt-4">
        <Card className="animate-fade-in rounded-none md:rounded-lg">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <CardTitle className="flex items-center gap-2">
                Regionenvergleich
                {isLoadingPriceData && <Loader2 className="h-4 w-4 animate-spin" />}
              </CardTitle>
              <ComparisonInfoModal />
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-0 md:border md:p-2">
            <div className="p-0 md:p-2">
              <div className="p-2 md:border">
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  minDate={earliestAvailableDate}
                  maxDate={latestAvailableDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                  timeZone={MARKET_TIMEZONE}
                />
              </div>

              <div className="border-t border-border px-2 py-3">
                <div className="mb-4 flex min-w-0 flex-wrap gap-2">
                  {availableRegions.map((region) => (
                    <Button
                      key={region.code}
                      variant="outline"
                      size="sm"
                      className={selectedRegionCodes.includes(region.code) ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                      aria-pressed={selectedRegionCodes.includes(region.code)}
                      onClick={() => toggleRegion(region.code)}
                    >
                      {region.localName}
                    </Button>
                  ))}
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                  <ControlMenu label="Anzeige" icon={SlidersHorizontal}>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Einheit</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className={priceUnit === 'EUR_MWh' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                            aria-pressed={priceUnit === 'EUR_MWh'}
                            onClick={() => handlePriceUnitChange('EUR_MWh')}
                          >
                            €/MWh
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={priceUnit === 'cent_kWh' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                            aria-pressed={priceUnit === 'cent_kWh'}
                            onClick={() => handlePriceUnitChange('cent_kWh')}
                          >
                            c/kWh
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Auflösung</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className={dataResolution === 'hourly' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                            aria-pressed={dataResolution === 'hourly'}
                            onClick={() => setDataResolution('hourly')}
                          >
                            Stündlich
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={dataResolution === 'interval' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                            aria-pressed={dataResolution === 'interval'}
                            onClick={() => setDataResolution('interval')}
                          >
                            15 Minuten
                          </Button>
                        </div>
                      </div>
                      {selectedRegionCodes.length >= 2 && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="compare-delta"
                            checked={showDelta}
                            onCheckedChange={handleCheckedChange(setShowDelta)}
                          />
                          <Label htmlFor="compare-delta" className="text-sm">Differenz-Modus</Label>
                        </div>
                      )}
                    </div>
                  </ControlMenu>

                  <ControlMenu label="Linien" icon={LineChart}>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="compare-zero-line"
                            checked={showZeroLine}
                            onCheckedChange={handleCheckedChange(setShowZeroLine)}
                          />
                          <Label htmlFor="compare-zero-line" className="text-sm">Nulllinie</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="compare-average-line"
                            checked={showAverageLine}
                            onCheckedChange={handleCheckedChange(setShowAverageLine)}
                          />
                          <Label htmlFor="compare-average-line" className="text-sm">Mittelwert</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="compare-enable-cutoff"
                            checked={cutoffEnabled}
                            onCheckedChange={handleCheckedChange(setCutoffEnabled)}
                          />
                          <Label htmlFor="compare-enable-cutoff" className="text-sm">Preis-Lineal</Label>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="compare-cutoff-value" className="text-sm font-medium">Linealpreis</Label>
                        <Input
                          id="compare-cutoff-value"
                          inputMode="decimal"
                          value={cutoffInput}
                          onChange={(event) => handleCutoffInputChange(event.target.value)}
                          placeholder={priceUnit === 'EUR_MWh' ? '€/MWh' : 'c/kWh'}
                          disabled={!cutoffEnabled}
                        />
                      </div>
                    </div>
                  </ControlMenu>

                  <ControlMenu label="Y-Skala" icon={ArrowUpDown}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <Label htmlFor="compare-y-min" className="text-sm font-medium">Min Preis</Label>
                            <div className="flex items-center gap-2">
                              <Checkbox id="compare-y-min-auto" checked={isYMinAuto} onCheckedChange={(checked) => setIsYMinAuto(checked === true)} />
                              <Label htmlFor="compare-y-min-auto" className="text-xs">Auto</Label>
                            </div>
                          </div>
                          <Input id="compare-y-min" inputMode="decimal" value={yMinInput} onChange={(event) => setYMinInput(event.target.value)} disabled={isYMinAuto} />
                        </div>
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <Label htmlFor="compare-y-max" className="text-sm font-medium">Max Preis</Label>
                            <div className="flex items-center gap-2">
                              <Checkbox id="compare-y-max-auto" checked={isYMaxAuto} onCheckedChange={(checked) => setIsYMaxAuto(checked === true)} />
                              <Label htmlFor="compare-y-max-auto" className="text-xs">Auto</Label>
                            </div>
                          </div>
                          <Input id="compare-y-max" inputMode="decimal" value={yMaxInput} onChange={(event) => setYMaxInput(event.target.value)} disabled={isYMaxAuto} />
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => { setIsYMinAuto(true); setIsYMaxAuto(true); }}>
                        Reset Ansicht
                      </Button>
                    </div>
                  </ControlMenu>
                </div>
              </div>

              <div className="space-y-4 border-t border-border px-2 py-3">
                <h3 className="text-sm font-medium text-foreground">Durchschnitt & Filter</h3>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-6">
                  <div className="min-w-0">
                    <AveragingOptions
                      selectedOption={averaging}
                      onChange={setAveraging}
                      isAveragingEnabled={isAveragingEnabled}
                      onAveragingToggle={setIsAveragingEnabled}
                    />
                  </div>
                  <div className="min-w-0">
                    <FilterOptions
                      filters={filters}
                      onChange={setFilters}
                      disabled={!isAveragingEnabled}
                      averagingOption={isAveragingEnabled ? averaging : 'none'}
                    />
                  </div>
                </div>
              </div>

              <div className="p-0 md:border md:p-2">
                {isLoadingPriceData ? (
                  <div className="flex h-[400px] flex-col items-center justify-center rounded-lg bg-muted">
                    <Loader2 className="mb-2 h-8 w-8 animate-spin" />
                    <p className="text-muted-foreground">Lädt Vergleichsdaten...</p>
                  </div>
                ) : displayedSeries.some((series) => series.energyPrices.length > 0) ? (
                  <EnergyChart
                    comparisonSeries={displayedSeries}
                    showSmartMeterData={false}
                    showTotalCost={false}
                    averaging={isAveragingEnabled ? averaging : 'none'}
                    showZeroLine={showZeroLine}
                    showAverageLine={showAverageLine}
                    dataResolution={dataResolution}
                    yMin={yMin}
                    yMax={yMax}
                    onAutoYDomainChange={handleAutoYDomainChange}
                    cutoffEnabled={cutoffEnabled}
                    cutoffValue={cutoffValue}
                    onCutoffValueChange={setCutoffValue}
                    activeRangePreset={activeRangePreset}
                    timeZone={MARKET_TIMEZONE}
                  />
                ) : (
                  <div className="flex h-[400px] items-center justify-center rounded-lg bg-muted px-4 text-center">
                    <p className="text-muted-foreground">
                      {selectedRegionCodes.length === 0
                        ? 'Bitte mindestens eine Region auswählen.'
                        : 'Keine Daten für den ausgewählten Zeitraum verfügbar.'}
                    </p>
                  </div>
                )}
              </div>

              {Object.keys(seriesErrors).length > 0 && (
                <div className="px-2 pb-2 text-sm text-muted-foreground">
                  {Object.entries(seriesErrors).map(([code, message]) => (
                    <div key={code}>{message}</div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
      <footer className="border-t bg-background py-6">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:flex-row">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Strompreisvergleich Europa | {footerSummary}
          </p>
          <p className="text-sm text-muted-foreground">
            made by <a href="https://topsrek.top" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@topsrek</a> in Austria
          </p>
          <a
            href="https://github.com/topsrek/european-energy-price-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub<ArrowUpRight className="mb-0.5 ml-1 inline-block h-4 w-4" />
          </a>
          <div className="flex gap-6">
            <Link to="/impressum" className="text-muted-foreground text-sm hover:text-primary transition-colors">
              Impressum
            </Link>
            <Link to="/privacy" className="text-muted-foreground text-sm hover:text-primary transition-colors">
              Datenschutz
            </Link>
            <ContactModal />
          </div>
          <VersionInfo />
        </div>
      </footer>
    </div>
  );
};

export default ComparisonPage;
