import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppHeader from '@/components/AppHeader';
import DateRangePicker from '@/components/DateRangePicker';
import AveragingOptions from '@/components/AveragingOptions';
import FilterOptions from '@/components/FilterOptions';
import EnergyChart from '@/components/EnergyChart';
import FileUpload from '@/components/FileUpload';
import ContractOptions from '@/components/ContractOptions';
import InfoModal from '@/components/InfoModal';
import HelpModal from '@/components/HelpModal';
import { AveragingOption, ContractOption, EnergyPrice, FilterOptions as FilterOptionsType, SmartMeterData } from '@/types/energy-data';
import { applyFilters, calculateAverage, convertEnergyPriceUnit, filterByDateRange } from '@/utils/data-utils';
import { fetchOptimizedBinaryPriceData } from '@/utils/optimized-binary-decoder';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpRight, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImpressumModal from '@/components/ImpressumModal';
import ContactModal from '@/components/ContactModal';
import { RegionConfig, saveSelectedRegion } from '@/config/regions';
import VersionInfo from '@/components/VersionInfo';
import { CheckedState } from '@radix-ui/react-checkbox';
import { getQuickRangeDates } from '@/utils/date-range-presets';

interface IndexProps {
  region: RegionConfig;
}

type DataResolution = 'hourly' | 'interval';
type PriceUnit = EnergyPrice['unit'];

interface CachedPriceData {
  data: EnergyPrice[];
  dataSource: string;
  latestTimestamp: string;
}

const DATA_RESOLUTION_STORAGE_KEY = 'eepa.dataResolution';
const PRICE_UNIT_STORAGE_KEY = 'eepa.priceUnit';
const DEFAULT_DATA_RESOLUTION: DataResolution = 'hourly';
const DEFAULT_PRICE_UNIT: PriceUnit = 'cent_kWh';
const DEFAULT_SHOW_ZERO_LINE = false;
const DEFAULT_SHOW_AVERAGE_LINE = false;

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

const getDataBaseUrl = () => import.meta.env.VITE_DATA_BASE_URL ?? '';

const isDataResolution = (value: string | null): value is DataResolution =>
  value === 'hourly' || value === 'interval';

const isPriceUnit = (value: string | null): value is PriceUnit =>
  value === 'EUR_MWh' || value === 'cent_kWh';

const parseResolutionQueryParam = (value: string | null): DataResolution | null => {
  if (value === '15min' || value === 'interval') return 'interval';
  if (value === 'hourly') return 'hourly';
  return null;
};

const serializeResolutionQueryParam = (value: DataResolution) =>
  value === 'interval' ? '15min' : 'hourly';

const parseUnitQueryParam = (value: string | null): PriceUnit | null => {
  if (value === 'eurmwh' || value === 'EUR_MWh') return 'EUR_MWh';
  if (value === 'ckwh' || value === 'cent_kWh') return 'cent_kWh';
  return null;
};

const serializeUnitQueryParam = (value: PriceUnit) =>
  value === 'EUR_MWh' ? 'eurmwh' : 'ckwh';

const readInitialDataResolution = (): DataResolution => {
  if (typeof window === 'undefined') return DEFAULT_DATA_RESOLUTION;

  const params = new URLSearchParams(window.location.search);
  const queryValue = parseResolutionQueryParam(params.get('resolution'));
  if (queryValue) return queryValue;

  try {
    const storedValue = window.localStorage.getItem(DATA_RESOLUTION_STORAGE_KEY);
    if (isDataResolution(storedValue)) return storedValue;
  } catch {
    // Ignore storage access failures and fall back to defaults.
  }

  return DEFAULT_DATA_RESOLUTION;
};

const readInitialPriceUnit = (): PriceUnit => {
  if (typeof window === 'undefined') return DEFAULT_PRICE_UNIT;

  const params = new URLSearchParams(window.location.search);
  const queryValue = parseUnitQueryParam(params.get('unit'));
  if (queryValue) return queryValue;

  try {
    const storedValue = window.localStorage.getItem(PRICE_UNIT_STORAGE_KEY);
    if (isPriceUnit(storedValue)) return storedValue;
  } catch {
    // Ignore storage access failures and fall back to defaults.
  }

  return DEFAULT_PRICE_UNIT;
};

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
        countryCode: region.countryCode,
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
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [isAveragingEnabled, setIsAveragingEnabled] = useState<boolean>(false);
  const [averaging, setAveraging] = useState<AveragingOption>('daily-cycle');
  const [filters, setFilters] = useState<FilterOptionsType>({
    months: Array.from({ length: 12 }, (_, i) => i), // All months
    weekdays: Array.from({ length: 7 }, (_, i) => i), // All days
    hours: Array.from({ length: 24 }, (_, i) => i), // All hours
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
  const [showZeroLine, setShowZeroLine] = useState(DEFAULT_SHOW_ZERO_LINE);
  const [showAverageLine, setShowAverageLine] = useState(DEFAULT_SHOW_AVERAGE_LINE);
  const dataCacheRef = useRef<Partial<Record<DataResolution, CachedPriceData>>>({});
  const hasVisiblePriceDataRef = useRef(false);

  const handleCheckedChange =
    (setter: React.Dispatch<React.SetStateAction<boolean>>) => (checked: CheckedState) => {
      setter(checked === true);
    };
  
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
    let isMounted = true;

    const setDateRangeFromData = (data: EnergyPrice[]) => {
      if (!data.length) return;

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

        toast({
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
  }, [region, dataResolution, toast]);

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

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, [dataResolution, priceUnit]);
  
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
  
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader region={region} />
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
                  <InfoModal trigger={
                    <Button variant="outline" size="sm" className="flex gap-1 items-center md:h-9 h-fit">
                      <Info className="h-4 w-4" />
                      <span className="whitespace-normal"> 
                        Wie funktioniert der österr. Strommarkt?
                      </span>
                    </Button>
                  } />
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

                <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-3 p-2 md:p-2">
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

                <div className="h-4 md:h-6 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                
                {/* Filters & Options */}
                <div className="flex flex-col gap-4 p-2 md:p-2 xl:flex-row xl:items-start xl:gap-6">
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
                
                {/* Visualization */}
                <div className="p-0 md:p-2 md:border border-none">
                  <h3 className="text-lg font-medium mb-2 pl-2 md:pl-0">Preisverlauf</h3>
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
                      <p className="text-sm text-muted-foreground">
                        Diese Funktion wird auf Anfrage implementiert
                      </p>
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
