
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
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckedState } from "@radix-ui/react-checkbox";

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
      unit: item.unit
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
      
      chartData.forEach(item => {
        // Energy price in the same unit as the chart
        if (item.unit === 'EUR_MWh') {
          (item as any).contractEnergyPrice = energyPriceInCents * 10; // Convert from cent/kWh to EUR/MWh
        } else {
          (item as any).contractEnergyPrice = energyPriceInCents;
        }
        
        // Calculate the base + fixed costs and with taxes
        const consumption = (item as any).consumption;
        if (consumption !== undefined) {
          const annualConsumption = showSmartMeterData && smartMeterData ? 
            smartMeterData.reduce((sum, data) => sum + data.consumption, 0) : 3500;
            
          // Daily base price in cents
          const dailyBasePrice = selectedContract.basePrice / 365;
          
          // Network costs approximated per kWh
          const networkCostPerDay = selectedContract.networkCosts(annualConsumption) / 365;
          
          // Convert to correct unit
          const fixedCostPerDay = dailyBasePrice + networkCostPerDay;
          const fixedCostPerHour = fixedCostPerDay / 24;
          
          // Convert to chart units
          if (item.unit === 'EUR_MWh') {
            // For MWh, we show price per MWh so we need to multiply the fixed costs
            (item as any).contractTotalPrice = (energyPriceInCents * 10) + (fixedCostPerHour * 1000 / consumption);
          } else {
            (item as any).contractTotalPrice = energyPriceInCents + (fixedCostPerHour * 100 / consumption);
          }
          
          // Add taxes (20% VAT in Austria)
          (item as any).contractTotalPriceTaxed = (item as any).contractTotalPrice * 1.2;
        }
      });
    }
    
    return chartData;
  };
  
  const chartData = prepareChartData();
  
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
        return format(date, 'MMM yyyy', { locale: de });
      case 'daily':
        return format(date, 'dd.MM.yyyy', { locale: de });
      case 'daily-cycle':
        return format(date, 'HH:00~' + format(new Date(date.getTime() + 3600000), 'HH:00'), { locale: de });
      case 'hourly':
        return format(date, 'dd.MM HH:00~' + format(new Date(date.getTime() + 3600000), 'HH:00'), { locale: de });
      default:
        // Default based on time unit
        switch (timeUnit) {
          case 'month':
            return format(date, 'MMM yy', { locale: de });
          case 'week':
          case 'day':
            return format(date, 'dd.MM', { locale: de });
          default:
            return format(date, 'HH:00~' + format(new Date(date.getTime() + 3600000), 'HH:00'), { locale: de });
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
          formattedDate = format(date, 'HH:00~' + format(new Date(date.getTime() + 3600000), 'HH:00'), { locale: de });
          break;
        case 'hourly':
          formattedDate = format(date, 'dd.MM.yyyy HH:00~' + format(new Date(date.getTime() + 3600000), 'HH:00'), { locale: de });
          break;
        default:
          formattedDate = format(date, 'dd.MM.yyyy HH:mm', { locale: de });
      }
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-md shadow-md">
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

  return (
    <div className="space-y-4">
      {selectedContract && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-gray-50">
          <div className="text-sm font-medium">Tariflinien anzeigen:</div>
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
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-gray-50">
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
      
      <div className="w-full h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 30, left: 20, bottom: 80 }}
          >
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={formatXAxis}
              label={{ value: getXAxisLabel(), position: 'bottom', offset: 60 }}
              minTickGap={30}
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
            <Legend wrapperStyle={{ paddingTop: 10, bottom: 0 }} />
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
                name={`${selectedContract.name} - Arbeitspreis`}
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
                name={`${selectedContract.name} - inkl. Fixkosten`}
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
                name={`${selectedContract.name} - inkl. Steuern`}
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
    </div>
  );
};

export default EnergyChart;
