
import React, { useEffect, useState, useCallback } from 'react';
import Header from '@/components/Header';
import DateRangePicker from '@/components/DateRangePicker';
import AveragingOptions from '@/components/AveragingOptions';
import FilterOptions from '@/components/FilterOptions';
import EnergyChart from '@/components/EnergyChart';
import FileUpload from '@/components/FileUpload';
import ContractOptions from '@/components/ContractOptions';
import InfoModal from '@/components/InfoModal';
import HelpModal from '@/components/HelpModal';
import { AveragingOption, ContractOption, EnergyPrice, FilterOptions as FilterOptionsType, SmartMeterData } from '@/types/energy-data';
import { applyFilters, calculateAverage, filterByDateRange, generateMockEnergyPrices } from '@/utils/data-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ImpressumModal from '@/components/ImpressumModal';
import ContactModal from '@/components/ContactModal';
import datesConfig from '@/config/dates.json';

const Index = () => {
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
  const [smartMeterData, setSmartMeterData] = useState<SmartMeterData[] | undefined>(undefined);
  const [showSmartMeterData, setShowSmartMeterData] = useState<boolean>(true);
  const [showTotalCost, setShowTotalCost] = useState<boolean>(false);
  const [annualConsumption, setAnnualConsumption] = useState<number>(3500); // Default annual consumption
  const [selectedContract, setSelectedContract] = useState<ContractOption | undefined>(undefined);
  
  // Mock contract options
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
    // In a real app, this would load from the binary file
    const initialData = generateMockEnergyPrices();
    setRawEnergyPrices(initialData);
    
    // Set initial date range to last 30 days
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 30);
    setStartDate(start);
    setEndDate(end);
    
    toast({
      title: "Daten geladen",
      description: "Die Energiepreisdaten wurden erfolgreich geladen."
    });
  }, []);
  
  // Process data whenever filters or date range changes
  useEffect(() => {
    if (!rawEnergyPrices.length) return;
    
    // Apply date range filter
    let filteredData = filterByDateRange(rawEnergyPrices, startDate, endDate);
    
    // Apply other filters if averaging is enabled
    if (isAveragingEnabled) {
      filteredData = applyFilters(filteredData, filters);
    }
    
    // Apply averaging if enabled
    const processedData = isAveragingEnabled ? 
      calculateAverage(filteredData, averaging) : 
      filteredData;
    
    setDisplayedEnergyPrices(processedData);
  }, [rawEnergyPrices, startDate, endDate, filters, averaging, isAveragingEnabled]);
  
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
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header version={datesConfig.version} lastUpdated={datesConfig.lastDataUpdate} />
      
      <main className="flex-grow container mx-auto py-8 px-4">
        <div className="space-y-8">
          <Card className="animate-fade-in">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Wiener Strompreis-Rechner</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Netzkosten basieren auf den Tarifen der Wiener Netze
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HelpModal />
                <InfoModal trigger={
                  <Button variant="outline" size="sm" className="flex gap-1 items-center">
                    <Info className="h-4 w-4" />
                    <span>Strommarkt</span>
                  </Button>
                } />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Date Range Picker */}
                <div>
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onStartDateChange={setStartDate}
                    onEndDateChange={setEndDate}
                  />
                </div>
                
                {/* Filters & Options */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <AveragingOptions
                      selectedOption={averaging}
                      onChange={setAveraging}
                      isAveragingEnabled={isAveragingEnabled}
                      onAveragingToggle={handleAveragingToggle}
                    />
                  </div>
                  <div>
                    <FilterOptions
                      filters={filters}
                      onChange={setFilters}
                      disabled={!isAveragingEnabled}
                      averagingOption={isAveragingEnabled ? averaging : 'none'}
                    />
                  </div>
                </div>
                
                {/* Visualization */}
                <div>
                  <div className="flex justify-end mb-1">
                    <span className="text-xs text-gray-500">Daten zuletzt aktualisiert: {datesConfig.lastDataUpdate}</span>
                  </div>
                  {displayedEnergyPrices.length > 0 ? (
                    <EnergyChart 
                      energyPrices={displayedEnergyPrices}
                      smartMeterData={smartMeterData}
                      showSmartMeterData={showSmartMeterData}
                      showTotalCost={showTotalCost}
                      selectedContract={selectedContract}
                      averaging={isAveragingEnabled ? averaging : 'none'}
                    />
                  ) : (
                    <div className="h-[400px] flex items-center justify-center bg-gray-100 rounded-lg">
                      <p className="text-gray-500">Keine Daten für den ausgewählten Zeitraum verfügbar</p>
                    </div>
                  )}
                </div>
                
                {/* Smart Meter Data Controls */}
                {smartMeterData && (
                  <div className="flex flex-wrap gap-4">
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
          
          <Card className="animate-fade-in">
            <CardHeader>
              <CardTitle>Wie viel kosten die günstigsten Tarife?</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="contracts">
                <TabsList>
                  <TabsTrigger value="contracts">Tarifoptionen</TabsTrigger>
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
                    <div className="bg-gray-100 rounded-lg p-4 mb-6 text-center">
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
      
      <footer className="bg-white border-t py-6">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Wiener Strompreis-Rechner | Alle Daten sind Beispieldaten
          </p>
          <div className="flex gap-4">
            <ImpressumModal />
            <ContactModal />
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
