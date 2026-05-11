import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import ComparisonInfoModal from '@/components/ComparisonInfoModal';
import ControlDisclosure from '@/components/ControlDisclosure';
import DateRangePicker from '@/components/DateRangePicker';
import AveragingOptions from '@/components/AveragingOptions';
import FilterOptions from '@/components/FilterOptions';
import EnergyChart from '@/components/EnergyChart';
import ContactModal from '@/components/ContactModal';
import ImpressumModal from '@/components/ImpressumModal';
import VersionInfo from '@/components/VersionInfo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ComparisonSeries, DataResolution, EnergyPrice, FilterOptions as FilterOptionsType, AveragingOption } from '@/types/energy-data';
import { RegionCode, regions } from '@/config/regions';
import { applyFilters, calculateAverage, convertEnergyPriceUnit, filterByDateRange } from '@/utils/data-utils';
import { fetchOptimizedBinaryPriceData } from '@/utils/optimized-binary-decoder';
import { getQuickRangeDates } from '@/utils/date-range-presets';
import {
  DATA_RESOLUTION_STORAGE_KEY,
  PRICE_UNIT_STORAGE_KEY,
  PriceUnit,
  parseQueryNumber,
  parseRegionCodesQueryParam,
  readInitialDataResolution,
  readInitialPriceUnit,
  serializeOptionalNumber,
  serializeResolutionQueryParam,
  serializeUnitQueryParam,
} from '@/utils/analyzer-state';
import { CheckedState } from '@radix-ui/react-checkbox';
import { safeStorageSetItem } from '@/lib/safe-storage';

interface CachedPriceData {
  data: EnergyPrice[];
  latestTimestamp: string;
}

const DEFAULT_SHOW_ZERO_LINE = false;
const DEFAULT_SHOW_AVERAGE_LINE = false;
const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

const getDataBaseUrl = () => import.meta.env.VITE_DATA_BASE_URL ?? '';

const latestTimestampFromData = (data: EnergyPrice[]) => {
  return data.reduce<string>((latest, record) => {
    if (!latest) return record.timestamp;
    return new Date(record.timestamp).getTime() > new Date(latest).getTime()
      ? record.timestamp
      : latest;
  }, '');
};

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
  const { toast } = useToast();
  const toastRef = useRef(toast);

  const [selectedRegionCodes, setSelectedRegionCodes] = useState<RegionCode[]>(() => {
    if (typeof window === 'undefined') return availableRegions.map((region) => region.code);
    const params = new URLSearchParams(window.location.search);
    return parseRegionCodesQueryParam(
      params.get('regions'),
      availableRegions.map((region) => region.code)
    ) || availableRegions.map((region) => region.code);
  });

  const [startDate, setStartDate] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const start = params.get('start');
    return start ? new Date(start) : null;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    if (typeof window === 'undefined') return new Date();
    const params = new URLSearchParams(window.location.search);
    const end = params.get('end');
    return end ? new Date(end) : new Date();
  });
  const [isAveragingEnabled, setIsAveragingEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('avg');
  });
  const [averaging, setAveraging] = useState<AveragingOption>(() => {
    if (typeof window === 'undefined') return 'daily-cycle';
    return (new URLSearchParams(window.location.search).get('avg') as AveragingOption) || 'daily-cycle';
  });
  
  const [filters, setFilters] = useState<FilterOptionsType>(() => {
    if (typeof window === 'undefined') {
      return {
        months: Array.from({ length: 12 }, (_, i) => i),
        weekdays: Array.from({ length: 7 }, (_, i) => i),
        hours: Array.from({ length: 24 }, (_, i) => i),
        daysOfMonth: Array.from({ length: 31 }, (_, i) => i + 1),
        weeksOfYear: Array.from({ length: 53 }, (_, i) => i + 1),
      };
    }

    const params = new URLSearchParams(window.location.search);
    const f_m = params.get('f_m')?.split(',').map(Number);
    const f_wd = params.get('f_wd')?.split(',').map(Number);
    const f_h = params.get('f_h')?.split(',').map(Number);
    const f_dm = params.get('f_dm')?.split(',').map(Number);
    const f_w = params.get('f_w')?.split(',').map(Number);

    return {
      months: f_m || Array.from({ length: 12 }, (_, i) => i),
      weekdays: f_wd || Array.from({ length: 7 }, (_, i) => i),
      hours: f_h || Array.from({ length: 24 }, (_, i) => i),
      daysOfMonth: f_dm || Array.from({ length: 31 }, (_, i) => i + 1),
      weeksOfYear: f_w || Array.from({ length: 53 }, (_, i) => i + 1),
    };
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

  const [cutoffEnabled, setCutoffEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('c') === '1';
  });

  const [cutoffValue, setCutoffValue] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const cv = new URLSearchParams(window.location.search).get('cv');
    return cv ? Number(cv) : null;
  });
  const [displayDisclosureOpen, setDisplayDisclosureOpen] = useState(false);
  const [scaleDisclosureOpen, setScaleDisclosureOpen] = useState(false);
  const [analysisDisclosureOpen, setAnalysisDisclosureOpen] = useState(false);
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

  const yMin = parseQueryNumber(yMinInput);
  const yMax = parseQueryNumber(yMaxInput);
  const selectedRegions = useMemo(
    () => availableRegions.filter((region) => selectedRegionCodes.includes(region.code)),
    [selectedRegionCodes]
  );

  const displayedSeries = useMemo<ComparisonSeries[]>(() => {
    const baseSeries = selectedRegions
      .map((region) => {
        const rawSeries = seriesByRegion[region.code] ?? [];
        if (!rawSeries.length) return null;

        const converted = convertEnergyPriceUnit(rawSeries, priceUnit);
        let filteredData = filterByDateRange(converted, startDate, endDate);
        if (isAveragingEnabled) {
          filteredData = applyFilters(filteredData, filters);
        }

        const processed = isAveragingEnabled ? calculateAverage(filteredData, averaging) : filteredData;
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

  const displaySummary = [
    selectedRegions.length ? `${selectedRegions.length} Regionen` : 'keine Region',
    priceUnit === 'EUR_MWh' ? '€/MWh' : 'c/kWh',
    dataResolution === 'interval' ? '15 Minuten' : 'Stündlich',
    [showZeroLine ? 'Nulllinie' : null, showAverageLine ? 'Mittelwert' : null].filter(Boolean).join(', ') || 'ohne Hilfslinien',
  ].join(' · ');

  const scaleSummary = (() => {
    const axisSummary =
      yMin !== null || yMax !== null
        ? `${yMin !== null ? yMin : 'auto'} bis ${yMax !== null ? yMax : 'auto'}`
        : 'Auto';
    const cutoffSummary = cutoffEnabled && cutoffValue !== null ? `Lineal ${cutoffValue.toFixed(2)}` : 'kein Lineal';
    return `${axisSummary} · ${cutoffSummary}`;
  })();

  const activeFilterCount =
    (filters.months.length < 12 ? 1 : 0) +
    (filters.weekdays.length < 7 ? 1 : 0) +
    (filters.hours.length < 24 ? 1 : 0);

  const analysisSummary = [
    isAveragingEnabled ? averaging : 'Rohdaten',
    activeFilterCount > 0 ? `${activeFilterCount} Filter` : 'ohne Filter',
  ].join(' · ');
  const footerSummary = selectedRegions.length
    ? `${selectedRegions.map((region) => region.appCode).join(', ')} · ${dataResolution === 'interval' ? '15 Minuten' : 'Stündlich'}`
    : 'Keine Region ausgewählt';

  useEffect(() => {
    document.documentElement.lang = 'de';
    document.title = 'Strompreisvergleich Europa - EEPA';
  }, []);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

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
    window.history.replaceState({}, '', nextUrl);
  }, [dataResolution, priceUnit, selectedRegionCodes, yMin, yMax, showZeroLine, showAverageLine, showDelta, cutoffEnabled, cutoffValue]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAveragingEnabled) {
      params.set('avg', averaging);
    } else {
      params.delete('avg');
    }
    
    // Serialize filters
    if (filters.months.length < 12) params.set('f_m', filters.months.join(',')); else params.delete('f_m');
    if (filters.weekdays.length < 7) params.set('f_wd', filters.weekdays.join(',')); else params.delete('f_wd');
    if (filters.hours.length < 24) params.set('f_h', filters.hours.join(',')); else params.delete('f_h');
    if (filters.daysOfMonth.length < 31) params.set('f_dm', filters.daysOfMonth.join(',')); else params.delete('f_dm');
    if (filters.weeksOfYear.length < 53) params.set('f_w', filters.weeksOfYear.join(',')); else params.delete('f_w');

    if (startDate) params.set('start', startDate.toISOString().split('T')[0]); else params.delete('start');
    if (endDate) params.set('end', endDate.toISOString().split('T')[0]); else params.delete('end');

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [isAveragingEnabled, averaging, filters, startDate, endDate]);

  useEffect(() => {
    let isMounted = true;

    const loadAllSelectedRegions = async () => {
      setIsLoadingPriceData(true);
      const nextSeries: Partial<Record<RegionCode, EnergyPrice[]>> = {};
      const nextErrors: Partial<Record<RegionCode, string>> = {};

      for (const region of selectedRegions) {
        const cachedEntry = cacheRef.current[dataResolution]?.[region.code];
        if (cachedEntry) {
          nextSeries[region.code] = cachedEntry.data;
          void isCachedDataFresh(region.marketCode, dataResolution, cachedEntry.latestTimestamp).then((fresh) => {
            if (!fresh && isMounted) {
              void loadAllSelectedRegions();
            }
          });
          continue;
        }

        try {
          const binaryPath = dataResolution === 'interval' ? region.dataFiles.interval : region.dataFiles.hourly;
          if (!binaryPath) {
            nextErrors[region.code] = 'Keine Datendatei verfügbar';
            continue;
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
              latestTimestamp: latestTimestampFromData(realData),
            },
          };
        } catch (error) {
          console.warn(`Failed to load ${region.code} comparison data`, error);
          nextErrors[region.code] =
            dataResolution === 'interval'
              ? `Für ${region.localName} wurde noch keine 15-Minuten-Datei gefunden.`
              : `Für ${region.localName} wurde keine aktuelle Preisdatei gefunden.`;
        }
      }

      if (!isMounted) return;

      setSeriesByRegion((previous) => ({ ...previous, ...nextSeries }));
      setSeriesErrors(nextErrors);

      const loadedSeries = selectedRegions
        .map((region) => nextSeries[region.code] ?? cacheRef.current[dataResolution]?.[region.code]?.data ?? [])
        .filter((series) => series.length > 0);

      if (loadedSeries.length > 0) {
        const allTimestamps = loadedSeries.flatMap((series) => series.map((record) => new Date(record.timestamp).getTime()));
        const earliest = new Date(Math.min(...allTimestamps));
        const latest = new Date(Math.max(...allTimestamps));
        setEarliestAvailableDate(earliest);
        setLatestAvailableDate(latest);

        if (!startDateRef.current || !endDateRef.current) {
          const today = new Date();
          const defaultRange = getQuickRangeDates('1y', today, earliest);
          setStartDate(defaultRange.startDate);
          setEndDate(today);
        }
      }

      if (Object.keys(nextErrors).length > 0 && loadedSeries.length === 0) {
        toastRef.current({
          title: 'Keine Vergleichsdaten verfügbar',
          description: 'Für die ausgewählten Regionen konnten keine Preisdateien geladen werden.',
          variant: 'destructive',
        });
      }

      setIsLoadingPriceData(false);
    };

    if (selectedRegions.length > 0) {
      void loadAllSelectedRegions();
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
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
              </div>

              <ControlDisclosure
                title="Anzeige"
                summary={displaySummary}
                open={displayDisclosureOpen}
                onOpenChange={setDisplayDisclosureOpen}
              >
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
                <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <Label className="shrink-0 text-sm font-medium">Einheit:</Label>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className={priceUnit === 'EUR_MWh' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                        aria-pressed={priceUnit === 'EUR_MWh'}
                        onClick={() => setPriceUnit('EUR_MWh')}
                      >
                        €/MWh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className={priceUnit === 'cent_kWh' ? SELECTED_OPTION_BUTTON_CLASS : undefined}
                        aria-pressed={priceUnit === 'cent_kWh'}
                        onClick={() => setPriceUnit('cent_kWh')}
                      >
                        c/kWh
                      </Button>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <Label className="shrink-0 text-sm font-medium">Auflösung:</Label>
                    <div className="flex min-w-0 flex-wrap gap-2">
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
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <Label className="shrink-0 text-sm font-medium">Hilfslinien:</Label>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="compare-zero-line"
                          checked={showZeroLine}
                          onCheckedChange={handleCheckedChange(setShowZeroLine)}
                        />
                        <Label htmlFor="compare-zero-line" className="text-sm">Zeige Nulllinie</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="compare-average-line"
                          checked={showAverageLine}
                          onCheckedChange={handleCheckedChange(setShowAverageLine)}
                        />
                        <Label htmlFor="compare-average-line" className="text-sm">Zeige Mittelwert</Label>
                      </div>
                      {selectedRegionCodes.length >= 2 && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="compare-delta"
                            checked={showDelta}
                            onCheckedChange={handleCheckedChange(setShowDelta)}
                          />
                          <Label htmlFor="compare-delta" className="text-sm font-bold">Differenz-Modus (Δ)</Label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </ControlDisclosure>

              <ControlDisclosure
                title="Y-Skala & Lineal"
                summary={scaleSummary}
                open={scaleDisclosureOpen}
                onOpenChange={setScaleDisclosureOpen}
              >
                <div className="flex min-w-0 flex-wrap items-end gap-3">
                  <div className="w-[120px] max-w-full">
                    <Label htmlFor="compare-y-min" className="mb-2 block text-sm font-medium">Min Preis</Label>
                    <Input id="compare-y-min" inputMode="decimal" value={yMinInput} onChange={(event) => setYMinInput(event.target.value)} placeholder="auto" />
                  </div>
                  <div className="w-[120px] max-w-full">
                    <Label htmlFor="compare-y-max" className="mb-2 block text-sm font-medium">Max Preis</Label>
                    <Input id="compare-y-max" inputMode="decimal" value={yMaxInput} onChange={(event) => setYMaxInput(event.target.value)} placeholder="auto" />
                  </div>
                  <Button variant="outline" onClick={() => { setYMinInput(''); setYMaxInput(''); }}>
                    Reset Ansicht
                  </Button>
                </div>
                <div className="mt-4 flex min-w-0 flex-wrap items-end gap-3">
                  <div className="flex items-center space-x-2 pb-2">
                    <Checkbox id="compare-enable-cutoff" checked={cutoffEnabled} onCheckedChange={handleCheckedChange(setCutoffEnabled)} />
                    <Label htmlFor="compare-enable-cutoff" className="text-sm">Preis-Lineal aktivieren</Label>
                  </div>
                  <div className="w-[140px] max-w-full">
                    <Label htmlFor="compare-cutoff-value" className="mb-2 block text-sm font-medium">Linealpreis</Label>
                    <Input
                      id="compare-cutoff-value"
                      inputMode="decimal"
                      value={cutoffValue === null ? '' : String(cutoffValue)}
                      onChange={(event) => {
                        const nextValue = Number(event.target.value);
                        setCutoffValue(Number.isFinite(nextValue) ? nextValue : null);
                      }}
                      placeholder={priceUnit === 'EUR_MWh' ? '€/MWh' : 'c/kWh'}
                      disabled={!cutoffEnabled}
                    />
                  </div>
                </div>
              </ControlDisclosure>

              <ControlDisclosure
                title="Durchschnitt & Filter"
                summary={analysisSummary}
                open={analysisDisclosureOpen}
                onOpenChange={setAnalysisDisclosureOpen}
              >
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
              </ControlDisclosure>

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
                    cutoffEnabled={cutoffEnabled}
                    cutoffValue={cutoffValue}
                    onCutoffValueChange={setCutoffValue}
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
          <div className="flex gap-4">
            <ImpressumModal />
            <ContactModal />
          </div>
          <VersionInfo />
        </div>
      </footer>
    </div>
  );
};

export default ComparisonPage;
