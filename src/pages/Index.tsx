import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppHeader from '@/components/AppHeader';
import ControlDisclosure from '@/components/ControlDisclosure';
import DateRangePicker from '@/components/DateRangePicker';
import AveragingOptions from '@/components/AveragingOptions';
import FilterOptions from '@/components/FilterOptions';
import EnergyChart from '@/components/EnergyChart';
import FileUpload from '@/components/FileUpload';
import ContractOptions from '@/components/ContractOptions';
import InfoModal from '@/components/InfoModal';
import HelpModal from '@/components/HelpModal';
import { AveragingOption, ContractOption, DataResolution, EnergyPrice, FilterOptions as FilterOptionsType, SmartMeterData } from '@/types/energy-data';
import { applyFilters, calculateAverage, convertEnergyPriceUnit, filterByDateRange, generateDemoSmartMeterData } from '@/utils/data-utils';
import { fetchOptimizedBinaryPriceData } from '@/utils/optimized-binary-decoder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpRight, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImpressumModal from '@/components/ImpressumModal';
import ContactModal from '@/components/ContactModal';
import { RegionConfig, saveSelectedRegion } from '@/config/regions';
import VersionInfo from '@/components/VersionInfo';
import { CheckedState } from '@radix-ui/react-checkbox';
import {
  DATA_RESOLUTION_STORAGE_KEY,
  PRICE_UNIT_STORAGE_KEY,
  DEFAULT_DATA_RESOLUTION,
  DEFAULT_PRICE_UNIT,
  PriceUnit,
  parseQueryNumber,
  readInitialDataResolution,
  readInitialPriceUnit,
  serializeOptionalNumber,
  serializeResolutionQueryParam,
  serializeUnitQueryParam,
} from '@/utils/analyzer-state';
import { getQuickRangeDates } from '@/utils/date-range-presets';

interface IndexProps {
  region: RegionConfig;
}

interface CachedPriceData {
  data: EnergyPrice[];
  dataSource: string;
  latestTimestamp: string;
}

const DEFAULT_SHOW_ZERO_LINE = false;
const DEFAULT_SHOW_AVERAGE_LINE = false;

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

const getDataBaseUrl = () => import.meta.env.VITE_DATA_BASE_URL ?? '';

const resolutionLabel = (resolution: DataResolution) =>
  resolution === 'interval' ? '15-Minuten' : 'stündliche';

const latestTimestampFromData = (data: EnergyPrice[]) => {
  return data.reduce<string>((latest, record) => {
    if (!latest) return record.timestamp;
    return new Date(record.timestamp).getTime() > new Date(latest).getTime()
      ? record.timestamp
      : latest;
  }, '');
};

const isCachedDataFresh = async (
  region: RegionConfig,
  resolution: DataResolution,
  latestTimestamp: string
) => {
  try {
    const dataBaseUrl = getDataBaseUrl().replace(/\/$/, '');
    const response = await fetch(`${dataBaseUrl}/api/data-freshness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        countryCode: region.marketCode,
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

const Index = ({ region }: IndexProps) => {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  
  // Read initial state from URL
  const initialParams = useMemo(() => {
    if (typeof window === 'undefined') return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  const [startDate, setStartDate] = useState<Date | null>(() => {
    const start = initialParams.get('start');
    return start ? new Date(start) : null;
  });
  const [endDate, setEndDate] = useState<Date | null>(() => {
    const end = initialParams.get('end');
    return end ? new Date(end) : new Date();
  });
  const [isAveragingEnabled, setIsAveragingEnabled] = useState<boolean>(() => initialParams.has('avg'));
  const [averaging, setAveraging] = useState<AveragingOption>(() => (initialParams.get('avg') as AveragingOption) || 'daily-cycle');
  
  const [filters, setFilters] = useState<FilterOptionsType>(() => {
    const f_m = initialParams.get('f_m')?.split(',').map(Number);
    const f_wd = initialParams.get('f_wd')?.split(',').map(Number);
    const f_h = initialParams.get('f_h')?.split(',').map(Number);
    const f_dm = initialParams.get('f_dm')?.split(',').map(Number);
    const f_w = initialParams.get('f_w')?.split(',').map(Number);

    return {
      months: f_m || Array.from({ length: 12 }, (_, i) => i),
      weekdays: f_wd || Array.from({ length: 7 }, (_, i) => i),
      hours: f_h || Array.from({ length: 24 }, (_, i) => i),
      daysOfMonth: f_dm || Array.from({ length: 31 }, (_, i) => i + 1),
      weeksOfYear: f_w || Array.from({ length: 53 }, (_, i) => i + 1),
    };
  });
  const [rawEnergyPrices, setRawEnergyPrices] = useState<EnergyPrice[]>([]);
  const [displayedEnergyPrices, setDisplayedEnergyPrices] = useState<EnergyPrice[]>([]);
  const [earliestAvailableDate, setEarliestAvailableDate] = useState<Date | null>(null);
  const [latestAvailableDate, setLatestAvailableDate] = useState<Date | null>(null);
  const [smartMeterData, setSmartMeterData] = useState<SmartMeterData[] | undefined>(undefined);
  const [showSmartMeterData, setShowSmartMeterData] = useState<boolean>(true);
  const [showTotalCost, setShowTotalCost] = useState<boolean>(false);
  const [annualConsumption, setAnnualConsumption] = useState<number>(3500); // Default annual consumption
  const [selectedContract, setSelectedContract] = useState<ContractOption | undefined>(undefined);
  const [isLoadingPriceData, setIsLoadingPriceData] = useState<boolean>(true);
  const [dataSource, setDataSource] = useState<string>('Lädt...');
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataResolution, setDataResolution] = useState<DataResolution>(readInitialDataResolution);
  const [priceUnit, setPriceUnit] = useState<PriceUnit>(readInitialPriceUnit);
  const [showZeroLine, setShowZeroLine] = useState(() => initialParams.get('z') === '1');
  const [showAverageLine, setShowAverageLine] = useState(() => initialParams.get('a') === '1');
  const [yMinInput, setYMinInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return initialParams.get('yMin') ?? '';
  });
  const [yMaxInput, setYMaxInput] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return initialParams.get('yMax') ?? '';
  });
  const [cutoffEnabled, setCutoffEnabled] = useState(() => initialParams.get('c') === '1');
  const [cutoffValue, setCutoffValue] = useState<number | null>(() => {
    const cv = initialParams.get('cv');
    return cv ? Number(cv) : null;
  });
  const [displayDisclosureOpen, setDisplayDisclosureOpen] = useState(false);
  const [scaleDisclosureOpen, setScaleDisclosureOpen] = useState(false);
  const [analysisDisclosureOpen, setAnalysisDisclosureOpen] = useState(false);
  const dataCacheRef = useRef<Partial<Record<DataResolution, CachedPriceData>>>({});
  const hasVisiblePriceDataRef = useRef(false);

  const yMin = parseQueryNumber(yMinInput);
  const yMax = parseQueryNumber(yMaxInput);

  const handleCheckedChange =
    (setter: React.Dispatch<React.SetStateAction<boolean>>) => (checked: CheckedState) => {
      setter(checked === true);
    };

  const displaySummary = [
    priceUnit === 'EUR_MWh' ? '€/MWh' : 'c/kWh',
    dataResolution === 'interval' ? '15 Minuten' : 'Stündlich',
    [
      showZeroLine ? 'Nulllinie' : null,
      showAverageLine ? 'Mittelwert' : null,
    ]
      .filter(Boolean)
      .join(', ') || 'ohne Hilfslinien',
  ].join(' · ');

  const scaleSummary = (() => {
    const axisSummary =
      yMin !== null || yMax !== null
        ? `${yMin !== null ? yMin : 'auto'} bis ${yMax !== null ? yMax : 'auto'}`
        : 'Auto';

    const cutoffSummary = cutoffEnabled && cutoffValue !== null
      ? `Lineal ${cutoffValue.toFixed(2)}`
      : 'kein Lineal';

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
  
  // Static starter tariff options with clearer naming that includes provider.
  const contractOptions: ContractOption[] = [
    {
      name: 'Flexibler Stromtarif',
      provider: 'Energie AG',
      basePrice: 96,
      energyPrice: 6.29,
      networkCosts: (totalConsumption) => 0.027 * totalConsumption + 45,
    },
    {
      name: 'Standard Tarif',
      provider: 'Wien Energie',
      basePrice: 102,
      energyPrice: 5.95,
      networkCosts: (totalConsumption) => 0.027 * totalConsumption + 45,
    },
    {
      name: 'Öko Strom Basic',
      provider: 'Grüne Energie GmbH',
      basePrice: 84,
      energyPrice: 7.10,
      networkCosts: (totalConsumption) => 0.027 * totalConsumption + 45,
    },
  ];
  
  // Load initial data
  useEffect(() => {
    saveSelectedRegion(region.code);
    document.documentElement.lang = region.language;
    document.title = `${region.title} - ${region.appCode}`;
  }, [region]);

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    let isMounted = true;

    const setDateRangeFromData = (data: EnergyPrice[]) => {
      if (!data.length || startDate || (endDate && endDate.toDateString() !== new Date().toDateString())) return;

      const timestamps = data.map((record) => new Date(record.timestamp).getTime());
      const earliest = new Date(Math.min(...timestamps));
      const latest = new Date(Math.max(...timestamps));
      const defaultRange = getQuickRangeDates('1y', latest, earliest);

      setStartDate(defaultRange.startDate);
      setEndDate(defaultRange.endDate);
    };

    const applyPriceData = (cachedData: CachedPriceData, resetDateRange: boolean) => {
      hasVisiblePriceDataRef.current = true;
      setRawEnergyPrices(cachedData.data);
      setDataSource(cachedData.dataSource);
      setDataError(null);
      const timestamps = cachedData.data.map((record) => new Date(record.timestamp).getTime());
      setEarliestAvailableDate(new Date(Math.min(...timestamps)));
      setLatestAvailableDate(new Date(cachedData.latestTimestamp));
      if (resetDateRange) {
        setDateRangeFromData(cachedData.data);
      }
    };

    const loadPriceData = async (preserveVisibleData = false) => {
      try {
        if (!preserveVisibleData) {
          hasVisiblePriceDataRef.current = false;
          setRawEnergyPrices([]);
          setDisplayedEnergyPrices([]);
        }

        setIsLoadingPriceData(true);
        setDataError(null);

        const binaryPath = dataResolution === 'interval'
          ? region.dataFiles.interval
          : region.dataFiles.hourly;

        if (!binaryPath) {
          throw new Error('No data file configured for selected resolution');
        }

        const dataBaseUrl = getDataBaseUrl();
        const binaryFile = `${dataBaseUrl}${binaryPath}`;
        const realData = await fetchOptimizedBinaryPriceData(binaryFile, {
          intervalMinutes: dataResolution === 'interval' ? 15 : 60,
        });

        if (!isMounted) return;

        const cachedData = {
          data: realData,
          latestTimestamp: latestTimestampFromData(realData),
          dataSource: `${realData.length.toLocaleString('de-AT')} reale ${resolutionLabel(dataResolution)} Preisdatensätze (${region.countryName})`,
        };

        dataCacheRef.current[dataResolution] = cachedData;
        applyPriceData(cachedData, !preserveVisibleData);
      } catch (error) {
        console.warn(`Failed to load ${region.code} binary price data:`, error);

        if (!isMounted) return;

        if (!preserveVisibleData) {
          hasVisiblePriceDataRef.current = false;
          setRawEnergyPrices([]);
          setDisplayedEnergyPrices([]);
          setStartDate(null);
          setEndDate(null);
          setEarliestAvailableDate(null);
          setLatestAvailableDate(null);
          setDataSource('Keine Datendatei verfügbar');
        }
        setDataError(
          dataResolution === 'interval'
            ? `Für ${region.countryName} wurde noch keine 15-Minuten-Preisdatei gefunden.`
            : `Für ${region.countryName} wurde keine aktuelle Preisdatei gefunden.`
        );

        toastRef.current({
          title: 'Keine Preisdaten verfügbar',
          description: `Für ${region.countryName} wurde keine Binärdatei gefunden.`,
          variant: 'destructive'
        });
      } finally {
        if (isMounted) {
          setIsLoadingPriceData(false);
        }
      }
    };

    const cachedData = dataCacheRef.current[dataResolution];
    if (cachedData) {
      applyPriceData(cachedData, false);
      setIsLoadingPriceData(false);

      void isCachedDataFresh(region, dataResolution, cachedData.latestTimestamp).then((fresh) => {
        if (isMounted && !fresh) {
          void loadPriceData(true);
        }
      });
    } else {
      void loadPriceData(hasVisiblePriceDataRef.current);
    }

    return () => {
      isMounted = false;
    };
  }, [region, dataResolution]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DATA_RESOLUTION_STORAGE_KEY, dataResolution);
      window.localStorage.setItem(PRICE_UNIT_STORAGE_KEY, priceUnit);
    } catch {
      // Ignore storage access failures in private or restricted contexts.
    }

    const params = new URLSearchParams(window.location.search);
    params.set('resolution', serializeResolutionQueryParam(dataResolution));
    params.set('unit', serializeUnitQueryParam(priceUnit));
    const serializedYMin = serializeOptionalNumber(yMin);
    const serializedYMax = serializeOptionalNumber(yMax);

    if (serializedYMin === null) {
      params.delete('yMin');
    } else {
      params.set('yMin', serializedYMin);
    }

    if (serializedYMax === null) {
      params.delete('yMax');
    } else {
      params.set('yMax', serializedYMax);
    }

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [dataResolution, priceUnit, yMin, yMax]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isAveragingEnabled) {
      params.set('avg', averaging);
    } else {
      params.delete('avg');
    }
    
    // Grid and Cutoff
    if (showZeroLine) params.set('z', '1'); else params.delete('z');
    if (showAverageLine) params.set('a', '1'); else params.delete('a');
    if (cutoffEnabled) {
      params.set('c', '1');
      if (cutoffValue !== null) params.set('cv', cutoffValue.toString());
    } else {
      params.delete('c');
      params.delete('cv');
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
  
  // Process data whenever filters or date range changes
  useEffect(() => {
    if (!rawEnergyPrices.length) return;
    
    const convertedEnergyPrices = convertEnergyPriceUnit(rawEnergyPrices, priceUnit);

    // Apply date range filter
    let filteredData = filterByDateRange(convertedEnergyPrices, startDate, endDate);
    
    // Apply other filters if averaging is enabled
    if (isAveragingEnabled) {
      filteredData = applyFilters(filteredData, filters);
    }
    
    // Apply averaging if enabled
    const processedData = isAveragingEnabled ? 
      calculateAverage(filteredData, averaging) : 
      filteredData;
    
    setDisplayedEnergyPrices(processedData);
  }, [rawEnergyPrices, priceUnit, startDate, endDate, filters, averaging, isAveragingEnabled]);

  useEffect(() => {
    if (cutoffValue !== null || !displayedEnergyPrices.length) {
      return;
    }

    const average =
      displayedEnergyPrices.reduce((sum, item) => sum + item.price, 0) /
      displayedEnergyPrices.length;
    setCutoffValue(Number(average.toFixed(2)));
  }, [cutoffValue, displayedEnergyPrices]);
  
  // Handler for averaging toggle
  const handleAveragingToggle = (enabled: boolean) => {
    setIsAveragingEnabled(enabled);
    // If averaging is disabled, we keep the option selected but don't apply it
  };
  
  // Handle smart meter file upload
  const handleSmartMeterDataUpload = useCallback((data: SmartMeterData[]) => {
    setSmartMeterData(data);
    setShowSmartMeterData(true);
  }, []);

  const handleLoadDemoData = () => {
    if (rawEnergyPrices.length > 0) {
      const demoData = generateDemoSmartMeterData(rawEnergyPrices);
      setSmartMeterData(demoData);
      setShowSmartMeterData(true);
      toast({
        title: 'Demo-Daten geladen',
        description: 'Ein beispielhaftes Verbrauchsprofil wurde generiert.',
      });
    }
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader title={region.title} region={region} />
      <main className="md:container mx-auto md:pt-4 md:px-4 md:pb-4 pb-2">
        <div className="space-y-0 md:space-y-8">
          <Card className="animate-fade-in md:rounded-lg rounded-none">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center gap-4 md:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Preisanalyse
                    {isLoadingPriceData && <Loader2 className="h-4 w-4 animate-spin" />}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-4">
                  <HelpModal />
                  {region.code === 'at' && (
                    <InfoModal trigger={
                      <Button variant="outline" size="sm" className="flex gap-1 items-center md:h-9 h-fit">
                        <Info className="h-4 w-4" />
                        <span className="whitespace-normal"> 
                          Wie funktioniert dieser Strommarkt?
                        </span>
                      </Button>
                    } />
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 md:p-2 pt-0 md:border border-none">
              <div className="space-y-0 md:space-y-0 p-0 md:p-2">
                {/* Date Range Picker */}
                <div className="p-2 md:p-2 md:border border-none">
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    minDate={earliestAvailableDate}
                    maxDate={latestAvailableDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
                
                <div className="h-4 md:h-6 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>

                <ControlDisclosure
                  title="Anzeige"
                  summary={displaySummary}
                  open={displayDisclosureOpen}
                  onOpenChange={setDisplayDisclosureOpen}
                >
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
                            id="show-zero-line"
                            checked={showZeroLine}
                            onCheckedChange={handleCheckedChange(setShowZeroLine)}
                          />
                          <Label htmlFor="show-zero-line" className="text-sm">Zeige Nulllinie</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="show-average-line"
                            checked={showAverageLine}
                            onCheckedChange={handleCheckedChange(setShowAverageLine)}
                          />
                          <Label htmlFor="show-average-line" className="text-sm">Zeige Mittelwert</Label>
                        </div>
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
                      <Label htmlFor="chart-y-min" className="mb-2 block text-sm font-medium">Min Preis</Label>
                      <Input
                        id="chart-y-min"
                        inputMode="decimal"
                        value={yMinInput}
                        onChange={(event) => setYMinInput(event.target.value)}
                        placeholder="auto"
                      />
                    </div>
                    <div className="w-[120px] max-w-full">
                      <Label htmlFor="chart-y-max" className="mb-2 block text-sm font-medium">Max Preis</Label>
                      <Input
                        id="chart-y-max"
                        inputMode="decimal"
                        value={yMaxInput}
                        onChange={(event) => setYMaxInput(event.target.value)}
                        placeholder="auto"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setYMinInput('');
                        setYMaxInput('');
                      }}
                    >
                      Reset Ansicht
                    </Button>
                  </div>
                  <div className="mt-4 flex min-w-0 flex-wrap items-end gap-3">
                    <div className="flex items-center space-x-2 pb-2">
                      <Checkbox
                        id="enable-cutoff"
                        checked={cutoffEnabled}
                        onCheckedChange={handleCheckedChange(setCutoffEnabled)}
                      />
                      <Label htmlFor="enable-cutoff" className="text-sm">Preis-Lineal aktivieren</Label>
                    </div>
                    <div className="w-[140px] max-w-full">
                      <Label htmlFor="cutoff-value" className="mb-2 block text-sm font-medium">Linealpreis</Label>
                      <Input
                        id="cutoff-value"
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
                        onAveragingToggle={handleAveragingToggle}
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
                
                {/* Visualization */}
                <div className="p-0 md:p-2 md:border border-none">
                  {isLoadingPriceData ? (
                    <div className="h-[400px] flex flex-col items-center justify-center bg-muted rounded-lg">
                      <Loader2 className="h-8 w-8 animate-spin mb-2" />
                      <p className="text-muted-foreground">Lädt Energiepreisdaten...</p>
                    </div>
                  ) : dataError ? (
                    <div className="h-[400px] flex items-center justify-center bg-muted rounded-lg px-4 text-center">
                      <p className="text-muted-foreground">{dataError}</p>
                    </div>
                  ) : displayedEnergyPrices.length > 0 ? (
                    <EnergyChart 
                      energyPrices={displayedEnergyPrices}
                      smartMeterData={smartMeterData}
                      showSmartMeterData={showSmartMeterData}
                      showTotalCost={showTotalCost}
                      selectedContract={selectedContract}
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
                    <div className="h-[400px] flex items-center justify-center bg-muted rounded-lg">
                      <p className="text-muted-foreground">Keine Daten für den ausgewählten Zeitraum verfügbar</p>
                    </div>
                  )}
                </div>
                
                {/* Smart Meter Data Controls */}
                {smartMeterData && (
                  <div className="flex flex-wrap gap-4 p-2 md:p-0">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="show-smart-meter"
                        checked={showSmartMeterData}
                        onCheckedChange={setShowSmartMeterData}
                      />
                      <Label htmlFor="show-smart-meter">Verbrauchsdaten anzeigen</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="show-cost"
                        checked={showTotalCost}
                        onCheckedChange={setShowTotalCost}
                        disabled={!showSmartMeterData}
                      />
                      <Label htmlFor="show-cost">Kosten anzeigen</Label>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <Card className="animate-fade-in md:rounded-lg rounded-none">
            <CardHeader>
              <CardTitle>Wie viel kosten die günstigsten Tarife?</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                  Netzkosten basieren auf den Tarifen der <b>Wiener Netze</b>
                </p>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="contracts">
                <TabsList>
                  <TabsTrigger value="contracts">Preisoptionen</TabsTrigger>
                  <TabsTrigger value="upload">Smart Meter Daten</TabsTrigger>
                </TabsList>
                <TabsContent value="contracts">
                  <ContractOptions
                    annualConsumption={annualConsumption}
                    onAnnualConsumptionChange={setAnnualConsumption}
                    contractOptions={contractOptions}
                    onSelectContract={setSelectedContract}
                    selectedContract={selectedContract}
                  />
                </TabsContent>
                <TabsContent value="upload">
                  <div className="p-4">
                    <div className="bg-muted rounded-lg p-4 mb-6 text-center">
                      <h3 className="text-lg font-medium mb-2">Smart Meter Daten Upload</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Diese Funktion wird auf Anfrage implementiert
                      </p>
                      {/* Demo Mode Button - Hidden for now as per instructions */}
                      {/* 
                      <Button onClick={handleLoadDemoData} variant="outline" size="sm">
                        Demo-Daten laden
                      </Button>
                      */}
                    </div>
                    <div className="opacity-50 pointer-events-none">
                      <h3 className="text-lg font-medium mb-4">Smart Meter Daten hochladen</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Laden Sie Ihre Smart Meter Daten hoch, um Ihren tatsächlichen Verbrauch zu 
                        analysieren und optimale Tarife zu finden.
                      </p>
                      <FileUpload onFileLoaded={handleSmartMeterDataUpload} />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
      
      <footer className="bg-background border-t py-6">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © {new Date().getFullYear()} {region.title} | {dataSource}
          </p>
          <p className="text-muted-foreground text-sm">
            made by <a href="https://topsrek.top" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">@topsrek</a> in Austria
          </p>
          <a
            href="https://github.com/topsrek/european-energy-price-analyzer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            GitHub<ArrowUpRight className="w-4 h-4 inline-block ml-1 mb-0.5" />
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

export default Index;
