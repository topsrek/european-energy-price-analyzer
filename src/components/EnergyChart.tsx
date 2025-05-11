
import React from 'react';
import { ChartData, EnergyPrice, SmartMeterData } from '@/types/energy-data';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

interface EnergyChartProps {
  energyPrices: EnergyPrice[];
  smartMeterData?: SmartMeterData[];
  showSmartMeterData: boolean;
  showTotalCost: boolean;
}

const EnergyChart: React.FC<EnergyChartProps> = ({ 
  energyPrices, 
  smartMeterData, 
  showSmartMeterData,
  showTotalCost 
}) => {
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
          item.consumption = consumption;
          
          // Add cost calculation if enabled
          if (showTotalCost) {
            const price = item.price;
            // Convert price from €/MWh to €/kWh if needed
            const pricePerKWh = item.unit === 'EUR_MWh' ? price / 1000 : price / 100;
            item.cost = consumption * pricePerKWh;
          }
        }
      });
    }
    
    return chartData;
  };
  
  const chartData = prepareChartData();
  
  // Calculate time unit based on data length
  const getTimeUnit = () => {
    if (energyPrices.length > 720) return 'month';
    if (energyPrices.length > 168) return 'week';
    if (energyPrices.length > 24) return 'day';
    return 'hour';
  };
  
  const timeUnit = getTimeUnit();
  
  // Format date tick based on selected time unit
  const formatXAxis = (timestamp: string) => {
    const date = parseISO(timestamp);
    switch (timeUnit) {
      case 'month':
        return format(date, 'MMM yy', { locale: de });
      case 'week':
      case 'day':
        return format(date, 'dd.MM', { locale: de });
      default:
        return format(date, 'HH:mm', { locale: de });
    }
  };
  
  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const date = parseISO(label);
      const formattedDate = format(date, 'dd.MM.yyyy HH:mm', { locale: de });
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-md shadow-md">
          <p className="font-medium text-sm mb-2">{formattedDate}</p>
          {payload.map((entry: any, index: number) => {
            let value = entry.value;
            let unit = '';
            
            if (entry.dataKey === 'price') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
            } else if (entry.dataKey === 'consumption') {
              unit = 'kWh';
            } else if (entry.dataKey === 'cost') {
              unit = '€';
            }
            
            return (
              <p key={`tooltip-${index}`} className="text-sm" style={{ color: entry.color }}>
                <span className="font-medium">{entry.name}: </span>
                {value.toFixed(2)} {unit}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className="w-full h-[500px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 20, bottom: 30 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis 
            dataKey="timestamp" 
            tickFormatter={formatXAxis}
            label={{ value: 'Datum', position: 'bottom', offset: 5 }}
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
          <Legend />
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
          {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
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
          {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && (
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
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default EnergyChart;
