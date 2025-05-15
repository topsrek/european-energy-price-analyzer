
import React, { useState } from 'react';
import { ChartData, EnergyPrice, SmartMeterData, ContractOption } from '@/types/energy-data';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine
} from 'recharts';
import { format, parseISO, getMonth, getWeek, isMonday, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { de } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckedState } from "@radix-ui/react-checkbox";
import { cn } from '@/lib/utils';
import datesConfig from '@/config/dates.json';

interface EnergyChartProps {
  energyPrices: EnergyPrice[];
  smartMeterData?: SmartMeterData[];
  showSmartMeterData: boolean;
  showTotalCost: boolean;
  selectedContract?: ContractOption;
  averaging: string;
}

const EnergyChart: React.FC<EnergyChartProps> = ({ 
  energyPrices, 
  smartMeterData, 
  showSmartMeterData,
  showTotalCost,
  selectedContract,
  averaging
}) => {
  // State for toggling visibility of various lines
  const [showBasePrice, setShowBasePrice] = useState(true);
  const [showTotalPrice, setShowTotalPrice] = useState(true);
  const [showWithTaxes, setShowWithTaxes] = useState(true);
  const [showConsumption, setShowConsumption] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [showWeekSeparators, setShowWeekSeparators] = useState(true);
  const [showMonthSeparators, setShowMonthSeparators] = useState(true);

  // Prepare chart data
  const prepareChartData = () => {
    // Create a map of timestamps to prices for quick lookup
    const priceMap = new Map<string, number>();
    energyPrices.forEach(price => {
      priceMap.set(price.timestamp, price.price);
    });
    
    // Start with price data
    const chartData = energyPrices.map(item => ({
      timestamp: item.timestamp,
      date: parseISO(item.timestamp),
      price: item.price,
      unit: item.unit,
      isMonthStart: isPotentiallyMonthStart(item.timestamp),
      isWeekStart: isPotentiallyWeekStart(item.timestamp)
    }));
    
    // Add consumption and cost data if available
    if (showSmartMeterData && smartMeterData && smartMeterData.length > 0) {
      // Create a map of timestamps to consumption
      const consumptionMap = new Map<string, number>();
      smartMeterData.forEach(item => {
        consumptionMap.set(item.timestamp, item.consumption);
      });
      
      // Add consumption data to matching price entries
      chartData.forEach(item => {
        const consumption = consumptionMap.get(item.timestamp);
        if (consumption !== undefined) {
          (item as any).consumption = consumption;
          
          // Add cost calculation if enabled
          if (showTotalCost) {
            const price = item.price;
            // Convert price from €/MWh to €/kWh if needed
            const pricePerKWh = item.unit === 'EUR_MWh' ? price / 1000 : price / 100;
            (item as any).cost = consumption * pricePerKWh;
          }
        }
      });
    }
    
    // Add contract reference prices if selected
    if (selectedContract) {
      const energyPriceInCents = selectedContract.energyPrice;
      
      // Calculate divisors based on averaging mode for proper distribution of fixed costs
      let divisor = 1;
      switch(averaging) {
        case 'monthly':
          divisor = 30 * 24; // ~30 days * 24 hours
          break;
        case 'daily':
          divisor = 24; // 24 hours
          break;
        case 'daily-cycle':
          divisor = 1; // Already per hour
          break;
        case 'hourly':
          divisor = 1; // Already per hour
          break;
        default:
          divisor = 1;
      }
      
      chartData.forEach(item => {
        // Energy price in the same unit as the chart
        if (item.unit === 'EUR_MWh') {
          (item as any).contractEnergyPrice = energyPriceInCents * 10; // Convert from cent/kWh to EUR/MWh
        } else {
          (item as any).contractEnergyPrice = energyPriceInCents;
        }
        
        // Calculate annualized consumption for proper distribution of fixed costs
        const annualConsumption = showSmartMeterData && smartMeterData 
          ? smartMeterData.reduce((sum, data) => sum + data.consumption, 0) * (365 / (smartMeterData.length / 24)) // Extrapolate to annual
          : 3500;
        
        // Base price distributed per time unit
        const basePricePerUnit = selectedContract.basePrice / (365 * 24) * divisor;
        
        // Network costs approximated per time unit
        const networkCostsPerUnit = selectedContract.networkCosts(annualConsumption) / (365 * 24) * divisor;
        
        // Total fixed costs distributed per unit
        const fixedCostPerUnit = basePricePerUnit + networkCostsPerUnit;
        
        // Calculate cost per kWh assuming 1 kWh consumption per unit for display
        // We add this fixed component to the energy price to show the effective price
        let effectiveCostPerKwh;
        
        // For daily cycle, distribute the daily fixed costs across the 24-hour profile based on typical consumption
        if (averaging === 'daily-cycle') {
          const hour = parseISO(item.timestamp).getHours();
          let hourlyWeight = 1;
          
          // Assign weights based on typical consumption patterns
          if (hour >= 7 && hour <= 9) hourlyWeight = 1.5; // Morning peak
          else if (hour >= 17 && hour <= 22) hourlyWeight = 2.0; // Evening peak
          else if (hour >= 23 || hour <= 6) hourlyWeight = 0.5; // Night low
          
          // Adjust fixed costs based on hourly weight
          const adjustedFixedCostPerUnit = fixedCostPerUnit * hourlyWeight;
          
          // Convert to chart units - we use a reference consumption of 0.5 kWh per hour
          // This gives us a reasonable visualization where the fixed costs component is visible
          const referenceCons = 0.5; // kWh
          
          if (item.unit === 'EUR_MWh') {
            // For MWh, we need to convert kWh to MWh (multiply by 1000)
            effectiveCostPerKwh = energyPriceInCents * 10 + (adjustedFixedCostPerUnit * 1000 / referenceCons);
          } else {
            effectiveCostPerKwh = energyPriceInCents + (adjustedFixedCostPerUnit * 100 / referenceCons);
          }
        } else {
          // For other averaging modes, use a similar approach
          // But with a constant reference consumption
          const referenceCons = averaging === 'monthly' ? 250 : // kWh per month
                              (averaging === 'daily' ? 8 : 0.5); // kWh per day or per hour
          
          if (item.unit === 'EUR_MWh') {
            effectiveCostPerKwh = energyPriceInCents * 10 + (fixedCostPerUnit * 1000 / referenceCons);
          } else {
            effectiveCostPerKwh = energyPriceInCents + (fixedCostPerUnit * 100 / referenceCons);
          }
        }
        
        // Set the values
        (item as any).contractTotalPrice = effectiveCostPerKwh;
        (item as any).contractTotalPriceTaxed = effectiveCostPerKwh * 1.2; // Add 20% VAT
      });
    }
    
    return chartData;
  };
  
  const chartData = prepareChartData();

  // Helper function to check if a timestamp is potentially a month start for visualization
  function isPotentiallyMonthStart(timestamp: string): boolean {
    const date = parseISO(timestamp);
    // Check if this is the first day of the month or the first data point for this month
    if (date.getDate() === 1) {
      return true;
    }
    
    // Check if this is the first data point in dataset
    const prevDate = new Date(date);
    prevDate.setDate(prevDate.getDate() - 1);
    
    return getMonth(date) !== getMonth(prevDate);
  }
  
  // Helper function to check if a timestamp is potentially a week start
  function isPotentiallyWeekStart(timestamp: string): boolean {
    const date = parseISO(timestamp);
    return isMonday(date);
  }
  
  // Calculate time unit based on data length and averaging option
  const getTimeUnit = () => {
    if (averaging === 'monthly') return 'month';
    if (averaging === 'daily') return 'day';
    if (averaging === 'daily-cycle') return 'hour';
    if (averaging === 'hourly') return 'hour';
    
    // Default based on data length
    if (energyPrices.length > 720) return 'month';
    if (energyPrices.length > 168) return 'week';
    if (energyPrices.length > 24) return 'day';
    return 'hour';
  };
  
  const timeUnit = getTimeUnit();
  
  // Format date tick based on selected time unit and averaging
  const formatXAxis = (timestamp: string) => {
    const date = parseISO(timestamp);
    
    switch (averaging) {
      case 'monthly':
        return format(date, 'MMM.', { locale: de });
      case 'daily':
        return format(date, 'dd.MM.yyyy', { locale: de });
      case 'daily-cycle':
        return format(date, 'HH:00', { locale: de });
      case 'hourly':
        return format(date, 'dd.MM. HH:00', { locale: de });
      default:
        // Default based on time unit
        switch (timeUnit) {
          case 'month':
            return format(date, 'MMM.', { locale: de });
          case 'week':
          case 'day':
            return format(date, 'dd.MM.', { locale: de });
          default:
            return format(date, 'HH:00', { locale: de });
        }
    }
  };
  
  // Get axis label based on averaging
  const getXAxisLabel = () => {
    switch (averaging) {
      case 'monthly':
        return 'Monatsdurchschnitt';
      case 'daily':
        return 'Tagesdurchschnitt';
      case 'daily-cycle':
        return 'Stunde des Tages';
      case 'hourly':
        return 'Stundendurchschnitt';
      default:
        return 'Datum';
    }
  };
  
  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = parseISO(label);
      
      // Format date based on averaging
      let formattedDate;
      switch (averaging) {
        case 'monthly':
          formattedDate = format(date, 'MMMM yyyy', { locale: de });
          break;
        case 'daily':
          formattedDate = format(date, 'dd.MM.yyyy', { locale: de });
          break;
        case 'daily-cycle':
          formattedDate = format(date, 'HH:00 Uhr', { locale: de });
          break;
        case 'hourly':
          formattedDate = format(date, 'dd.MM.yyyy HH:00 Uhr', { locale: de });
          break;
        default:
          formattedDate = format(date, 'dd.MM.yyyy HH:mm', { locale: de });
      }
      
      return (
        <div className="bg-card p-3 border border-border rounded-md shadow-md">
          <p className="font-medium text-sm mb-2">{formattedDate}</p>
          {payload.map((entry: any, index: number) => {
            if (!entry.value) return null;
            
            let value = entry.value;
            let unit = '';
            let name = entry.name;
            
            if (entry.dataKey === 'price') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
              name = 'Strompreis';
            } else if (entry.dataKey === 'consumption') {
              unit = 'kWh';
              name = 'Verbrauch';
            } else if (entry.dataKey === 'cost') {
              unit = '€';
              name = 'Kosten';
            } else if (entry.dataKey === 'contractEnergyPrice') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
              name = `${selectedContract?.name}: Arbeitspreis`;
            } else if (entry.dataKey === 'contractTotalPrice') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
              name = `${selectedContract?.name}: inkl. Fixkosten`;
            } else if (entry.dataKey === 'contractTotalPriceTaxed') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
              name = `${selectedContract?.name}: inkl. Steuern`;
            }
            
            return (
              <p key={`tooltip-${index}`} className="text-sm" style={{ color: entry.color }}>
                <span className="font-medium">{name}: </span>
                {value.toFixed(2)} {unit}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Handler for checkbox changes
  const handleCheckedChange = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    return (checked: CheckedState) => {
      setter(checked === true);
    };
  };

  // Create alternating background sections for months - fixed version
  const renderMonthBands = () => {
    if (!showMonthSeparators) {
      return null;
    }

    const bands: JSX.Element[] = [];
    
    if (chartData.length > 0) {
      let currentMonth = -1;
      let bandStart = 0;
      let isGray = false;
      
      chartData.forEach((item, index) => {
        const date = parseISO(item.timestamp);
        const month = date.getMonth();
        
        if (month !== currentMonth) {
          if (currentMonth !== -1) {
            // Calculate position as percentage of chart width
            const startPercent = (bandStart / (chartData.length - 1)) * 100;
            const widthPercent = ((index - bandStart) / (chartData.length - 1)) * 100;
            
            bands.push(
              <rect
                key={`month-band-${bandStart}`}
                x={`${startPercent}%`}
                y="0"
                width={`${widthPercent}%`}
                height="100%"
                fill={isGray ? "var(--chart-band-color)" : "transparent"}
                fillOpacity={0.3}
              />
            );
            isGray = !isGray;
          }
          currentMonth = month;
          bandStart = index;
        }
        
        // Handle the last band
        if (index === chartData.length - 1) {
          // Calculate position as percentage of chart width
          const startPercent = (bandStart / (chartData.length - 1)) * 100;
          const widthPercent = ((index - bandStart + 1) / (chartData.length - 1)) * 100;
          
          bands.push(
            <rect
              key={`month-band-${bandStart}`}
              x={`${startPercent}%`}
              y="0"
              width={`${widthPercent}%`}
              height="100%"
              fill={isGray ? "var(--chart-band-color)" : "transparent"}
              fillOpacity={0.3}
            />
          );
        }
      });
    }
    
    return (
      <g className="month-bands">
        {bands}
      </g>
    );
  };

  // Create week start markers - fixed version
  const renderWeekMarkers = () => {
    if (!showWeekSeparators) {
      return null;
    }

    const markers: JSX.Element[] = [];
    
    chartData.forEach((item, index) => {
      if (item.isWeekStart) {
        // Calculate position as percentage of chart width
        const positionPercent = (index / (chartData.length - 1)) * 100;
        
        markers.push(
          <line
            key={`week-marker-${index}`}
            x1={`${positionPercent}%`}
            y1="0"
            x2={`${positionPercent}%`}
            y2="100%"
            stroke="var(--week-marker-color)"
            strokeWidth={1}
            strokeDasharray="3,3"
            strokeOpacity={0.5}
          />
        );
      }
    });
    
    return (
      <g className="week-markers">
        {markers}
      </g>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Energiepreisverlauf</h3>
      </div>
      
      {selectedContract && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
          <div className="text-sm font-medium">Tarifoptionen für {selectedContract.provider} {selectedContract.name} anzeigen:</div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-base-price" 
              checked={showBasePrice} 
              onCheckedChange={handleCheckedChange(setShowBasePrice)}
            />
            <Label htmlFor="show-base-price" className="text-sm">Arbeitspreis</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-total-price" 
              checked={showTotalPrice} 
              onCheckedChange={handleCheckedChange(setShowTotalPrice)}
            />
            <Label htmlFor="show-total-price" className="text-sm">Inkl. Fixkosten</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-with-taxes" 
              checked={showWithTaxes} 
              onCheckedChange={handleCheckedChange(setShowWithTaxes)}
            />
            <Label htmlFor="show-with-taxes" className="text-sm">Inkl. Steuern</Label>
          </div>
        </div>
      )}
      
      {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
          <div className="text-sm font-medium">Verbrauchsdaten anzeigen:</div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-consumption" 
              checked={showConsumption} 
              onCheckedChange={handleCheckedChange(setShowConsumption)}
            />
            <Label htmlFor="show-consumption" className="text-sm">Verbrauch</Label>
          </div>
          {showTotalCost && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="show-cost" 
                checked={showCost} 
                onCheckedChange={handleCheckedChange(setShowCost)}
              />
              <Label htmlFor="show-cost" className="text-sm">Kosten</Label>
            </div>
          )}
        </div>
      )}
      
      <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
        <div className="text-sm font-medium">Abschnitt-Visualisierung:</div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="show-month-separators" 
            checked={showMonthSeparators} 
            onCheckedChange={handleCheckedChange(setShowMonthSeparators)}
          />
          <Label htmlFor="show-month-separators" className="text-sm">Monatsabschnitte</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="show-week-separators" 
            checked={showWeekSeparators} 
            onCheckedChange={handleCheckedChange(setShowWeekSeparators)}
          />
          <Label htmlFor="show-week-separators" className="text-sm">Wochenbegrenzungen</Label>
        </div>
      </div>
      
      <div className="w-full h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
            className="bg-card rounded-lg p-2 border"
          >
            <defs>
              <style type="text/css">
                {`
                  :root {
                    --chart-band-color: ${theme === 'dark' ? '#2a2a2a' : '#f3f3f3'};
                    --week-marker-color: ${theme === 'dark' ? '#555' : '#ccc'};
                  }
                  .recharts-cartesian-grid-horizontal line,
                  .recharts-cartesian-grid-vertical line {
                    stroke: var(--border);
                    opacity: 0.3;
                  }
                  .recharts-legend-wrapper {
                    bottom: 5px !important;
                  }
                  .recharts-xaxis .recharts-label {
                    transform: translateY(10px);
                  }
                `}
              </style>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            
            {/* Background bands for months */}
            {renderMonthBands()}
            
            {/* Week start markers */}
            {renderWeekMarkers()}
            
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis}
              label={{ value: getXAxisLabel(), position: 'bottom', offset: 50 }}
              minTickGap={30}
              height={60}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              yAxisId="price"
              domain={['auto', 'auto']}
              label={{ 
                value: energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh', 
                angle: -90, 
                position: 'left',
                offset: -5
              }}
            />
            {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
              <YAxis
                yAxisId="consumption"
                orientation="right"
                label={{ value: 'kWh', angle: 90, position: 'right' }}
              />
            )}
            {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && (
              <YAxis
                yAxisId="cost"
                orientation="right"
                label={{ value: '€', angle: 90, position: 'right', offset: 40 }}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="bottom" 
              height={36} 
              wrapperStyle={{ paddingTop: '20px', bottom: '0px !important' }}
            />
            <Line
              type="monotone"
              dataKey="price"
              name="Strompreis"
              yAxisId="price"
              stroke="#e53935"
              strokeWidth={2}
              dot={energyPrices.length > 100 ? false : {}}
              activeDot={{ r: 5 }}
            />
            {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && showConsumption && (
              <Line
                type="monotone"
                dataKey="consumption"
                name="Verbrauch"
                yAxisId="consumption"
                stroke="#4285f4"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
              />
            )}
            {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && showCost && (
              <Line
                type="monotone"
                dataKey="cost"
                name="Kosten"
                yAxisId="cost"
                stroke="#34a853"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
              />
            )}
            {selectedContract && showBasePrice && (
              <Line
                type="monotone"
                dataKey="contractEnergyPrice"
                name={`${selectedContract.provider} ${selectedContract.name} - Arbeitspreis`}
                yAxisId="price"
                stroke="#9c27b0"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
            {selectedContract && showTotalPrice && (
              <Line
                type="monotone"
                dataKey="contractTotalPrice"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Fixkosten`}
                yAxisId="price"
                stroke="#ff9800"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
            {selectedContract && showWithTaxes && (
              <Line
                type="monotone"
                dataKey="contractTotalPriceTaxed"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Steuern`}
                yAxisId="price"
                stroke="#795548"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-sm text-muted-foreground text-right">
        Daten zuletzt aktualisiert: {datesConfig.dataLastUpdated}
      </div>
    </div>
  );
};

// Get the current theme for styling - this will be used inside the component
const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

export default EnergyChart;
