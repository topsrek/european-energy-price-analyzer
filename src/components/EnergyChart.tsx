import React, { useState, useEffect, useMemo } from 'react';
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
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { format, parseISO, getMonth, isMonday, getDate, getDay, differenceInDays, differenceInMonths, getHours, getMinutes, getISOWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckedState } from "@radix-ui/react-checkbox";
import { cn } from '@/lib/utils';

// Define the structure for individual data points used in the chart
interface ExtendedChartDataPoint {
  timestamp: string;
  date: Date; // Parsed date object for easier manipulation
  price: number;
  unit: 'EUR_MWh' | 'cent_kWh';
  isFirstDataPointOfDay?: boolean;
  isFirstDataPointOfWeek?: boolean;
  isFirstDataPointOfMonth?: boolean;
  consumption?: number; 
  cost?: number;
  contractEnergyPrice?: number;
  contractNetworkCosts?: number;
  contractTotalPrice?: number;
  contractTotalPriceTaxed?: number;
  fixedCosts?: number; // New property for fixed costs
  // Allow other dynamic properties if necessary, though specific props are preferred
  [key: string]: unknown;
}

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
  const [showNetworkCosts, setShowNetworkCosts] = useState(true);
  const [showWithTaxes, setShowWithTaxes] = useState(true);
  const [showConsumption, setShowConsumption] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [showWeekSeparators, setShowWeekSeparators] = useState(true);
  const [showMonthSeparators, setShowMonthSeparators] = useState(true);
  const [showDaySeparators, setShowDaySeparators] = useState(false);
  const [showSpotPriceWithTax, setShowSpotPriceWithTax] = useState(false);
  const priceUnitLabel = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'c/kWh';

  // Prepare chart data, memoized
  const chartData = useMemo(() => {
    const priceMap = new Map<string, number>();
    energyPrices.forEach(price => {
      priceMap.set(price.timestamp, price.price);
    });
    
    const internalChartData: ExtendedChartDataPoint[] = energyPrices.map(item => {
      const date = parseISO(item.timestamp);
      let processedPrice = item.price;
      
      // Add tax to spot price if enabled
      if (showSpotPriceWithTax) {
        processedPrice = item.price * 1.2; // Add 20% VAT
      }
      
      return {
        timestamp: item.timestamp,
        date: date,
        price: processedPrice,
        originalPrice: item.price, // Keep original for reference
        unit: item.unit,
      };
    });
    
    const dayProcessed = new Map<string, boolean>();
    const weekProcessed = new Map<string, boolean>();
    const monthProcessed = new Map<string, boolean>();

    internalChartData.forEach(item => {
      const date = item.date;
      const dayKey = format(date, 'yyyy-MM-dd');
      if (!dayProcessed.has(dayKey)) {
        item.isFirstDataPointOfDay = true;
        dayProcessed.set(dayKey, true);
      } else {
        item.isFirstDataPointOfDay = false;
      }

      const weekOfYearKey = format(date, 'yyyy-II');
      if (getDay(date) === 1) {
        if (!weekProcessed.has(weekOfYearKey)) {
          item.isFirstDataPointOfWeek = true;
          weekProcessed.set(weekOfYearKey, true);
        } else {
          item.isFirstDataPointOfWeek = false;
        }
      } else {
        item.isFirstDataPointOfWeek = false;
      }

      const monthKey = format(date, 'yyyy-MM');
      if (!monthProcessed.has(monthKey)) {
        item.isFirstDataPointOfMonth = true;
        monthProcessed.set(monthKey, true);
      } else {
        item.isFirstDataPointOfMonth = false;
      }
    });

    if (showSmartMeterData && smartMeterData && smartMeterData.length > 0) {
      const consumptionMap = new Map<string, number>();
      smartMeterData.forEach(item => {
        consumptionMap.set(item.timestamp, item.consumption);
      });
      
      internalChartData.forEach(item => {
        const consumption = consumptionMap.get(item.timestamp);
        if (consumption !== undefined) {
          item.consumption = consumption;
          if (showTotalCost) {
            const price = item.price;
            const pricePerKWh = item.unit === 'EUR_MWh' ? price / 1000 : price / 100;
            item.cost = consumption * pricePerKWh;
          }
        }
      });
    }
    
    if (selectedContract) {
      const energyPriceInCents = selectedContract.energyPrice;
      const annualConsumption = showSmartMeterData && smartMeterData 
        ? smartMeterData.reduce((sum, data) => sum + data.consumption, 0) * (365 / (smartMeterData.length / 24))
        : 3500;
      
      const networkCostsPerYear = selectedContract.networkCosts(annualConsumption);
      const networkCostsPerKwh = networkCostsPerYear / annualConsumption;
      
      internalChartData.forEach(item => {
        // Contract energy price (Nettostromkosten)
        if (item.unit === 'EUR_MWh') {
          item.contractEnergyPrice = energyPriceInCents * 10;
          item.contractNetworkCosts = (energyPriceInCents + networkCostsPerKwh * 100) * 10;
          item.contractTotalPriceTaxed = (energyPriceInCents + networkCostsPerKwh * 100) * 10 * 1.2;
        } else {
          item.contractEnergyPrice = energyPriceInCents;
          item.contractNetworkCosts = energyPriceInCents + (networkCostsPerKwh * 100);
          item.contractTotalPriceTaxed = (energyPriceInCents + (networkCostsPerKwh * 100)) * 1.2;
        }
      });
    }
    
    // Data point reduction for performance optimization
    const reduceDataPoints = (data: ExtendedChartDataPoint[]) => {
      if (data.length === 0) return data;
      
      const totalDataPoints = data.length;
      const threeMonthsInHours = 90 * 24; // ~2160 data points for 3 months
      const oneYearInHours = 365 * 24; // 8760 data points for a year
      const fiveYearsInHours = 5 * oneYearInHours; // 43800 data points for 5 years
      const tenYearsInHours = 10 * oneYearInHours; // 87600 data points for 10 years
      
      let step = 1; // Default: show all data points
      
      if (totalDataPoints > tenYearsInHours) {
        step = 24; // Show every 24th hour (daily data points)
      } else if (totalDataPoints > fiveYearsInHours) {
        step = 12; // Show every 12th hour (twice daily data points)
      } else if (totalDataPoints > oneYearInHours) {
        step = 3; // Show every 3rd hour
      } else if (totalDataPoints > threeMonthsInHours) {
        step = 2; // Show every 2nd hour for more than 3 months
      }
      
      if (step === 1) return data; // No reduction needed
      
      // Always include the first data point
      const reducedData = [data[0]];
      
      // Add every nth data point based on step
      for (let i = step; i < data.length; i += step) {
        reducedData.push(data[i]);
      }
      
      // Always include the last data point if it wasn't already included
      const lastIndex = data.length - 1;
      if (lastIndex > 0 && (lastIndex % step !== 0)) {
        reducedData.push(data[lastIndex]);
      }
      
      return reducedData;
    };
    
    return reduceDataPoints(internalChartData);
  }, [energyPrices, smartMeterData, showSmartMeterData, showTotalCost, selectedContract, showSpotPriceWithTax]);

  // Calculate data timespan in days and months
  const dataTimeSpanDays = chartData.length > 0 
    ? differenceInDays(chartData[chartData.length - 1].date, chartData[0].date)
    : 0;
  
  const dataTimeSpanMonths = chartData.length > 0 
    ? differenceInMonths(chartData[chartData.length - 1].date, chartData[0].date)
    : 0;

  // Auto-disable highlights based on time span - calculate BEFORE rendering
  const shouldShowDaySeparators = showDaySeparators && dataTimeSpanMonths < 3;
  const shouldShowWeekSeparators = showWeekSeparators && dataTimeSpanMonths < 6;
  
  // Auto-update state when timespan changes (but only when needed to avoid loops)
  useEffect(() => {
    if (dataTimeSpanMonths >= 3 && showDaySeparators) {
      setShowDaySeparators(false);
    }
    if (dataTimeSpanMonths >= 6 && showWeekSeparators) {
      setShowWeekSeparators(false);
    }
  }, [dataTimeSpanMonths, showDaySeparators, showWeekSeparators]); // Include all dependencies

  // Generate dynamic ticks for XAxis
  const getXAxisTicks = () => {
    if (!chartData || chartData.length === 0) {
      return [];
    }

    const ticks: string[] = [];
    const firstDate = chartData[0].date;
    const lastDate = chartData[chartData.length - 1].date;
    const daysDiff = differenceInDays(lastDate, firstDate);

    // Handle cases based on 'averaging' prop first
    if (averaging === 'daily-cycle') {
      // For daily-cycle, show specific hours if data covers them
      const uniqueHours = new Set(chartData.map(d => getHours(d.date)));
      const tickHours = [0, 6, 12, 18]; // Default hours to show
      tickHours.forEach(hour => {
        if (uniqueHours.has(hour)) {
           const firstMatch = chartData.find(d => getHours(d.date) === hour);
           if (firstMatch) ticks.push(firstMatch.timestamp);
        }
      });
      // Ensure at least first and last points are there if no specific hours match
      if (ticks.length === 0) {
        ticks.push(chartData[0].timestamp);
        if (chartData.length > 1) ticks.push(chartData[chartData.length - 1].timestamp);
      }
      return ticks.filter((t, i, arr) => arr.indexOf(t) === i); // Unique ticks
    }
    
    if (averaging === 'hourly') {
        // For hourly, show a tick every 6 or 12 hours if the span is large enough
        let step = 1; // Show every hour by default
        if (chartData.length > 24 * 3) step = 6; // Every 6 hours if more than 3 days of hourly data
        if (chartData.length > 24 * 7) step = 12; // Every 12 hours if more than 7 days
        
        chartData.forEach((item, index) => {
            if (index % step === 0) {
                ticks.push(item.timestamp);
            }
        });
        if (ticks.length === 0 && chartData.length > 0) ticks.push(chartData[0].timestamp);
        if (chartData.length > 1 && !ticks.includes(chartData[chartData.length - 1].timestamp)) {
            ticks.push(chartData[chartData.length -1].timestamp);
        }
        return ticks.filter((t, i, arr) => arr.indexOf(t) === i);
    }


    if (averaging === 'daily') {
      // Show every Nth day
      let step = 1;
      if (daysDiff > 10) step = 2;
      if (daysDiff > 30) step = 3;
      if (daysDiff > 90) step = 7; // Every week
      
      let lastPushedDate: Date | null = null;
      chartData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= step) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
       if (ticks.length === 0 && chartData.length > 0) ticks.push(chartData[0].timestamp);
       if (chartData.length > 1 && !ticks.includes(chartData[chartData.length - 1].timestamp)) {
            ticks.push(chartData[chartData.length -1].timestamp);
        }
      return ticks.filter((t, i, arr) => arr.indexOf(t) === i);
    }

    if (averaging === 'monthly') {
      // Show every month
      const monthTicks = new Set<string>();
      chartData.forEach(item => {
        if (item.isFirstDataPointOfMonth) {
          monthTicks.add(item.timestamp);
        }
      });
      // Add first and last if not already present and set is small
      if (monthTicks.size < 2 && chartData.length > 0) {
        monthTicks.add(chartData[0].timestamp);
        if (chartData.length > 1) monthTicks.add(chartData[chartData.length-1].timestamp);
      }
      return Array.from(monthTicks);
    }


    // Default dynamic ticks if no specific averaging mode dictates them
    if (daysDiff < 3) { // Less than 3 days: potentially more ticks
      chartData.forEach(item => {
        const hour = getHours(item.date);
        if (hour % 6 === 0) { // Ticks at 00:00, 06:00, 12:00, 18:00
          ticks.push(item.timestamp);
        }
      });
      // Ensure first and last points are ticks
      if (chartData.length > 0 && !ticks.includes(chartData[0].timestamp)) {
        ticks.unshift(chartData[0].timestamp);
      }
      if (chartData.length > 1 && !ticks.includes(chartData[chartData.length - 1].timestamp)) {
        ticks.push(chartData[chartData.length - 1].timestamp);
      }
    } else if (daysDiff <= 10) { // 3-10 days: a tick per day (midnight or first data point of day)
      const dailyTicks = new Map<string, string>();
      chartData.forEach(item => {
        const dayKey = format(item.date, 'yyyy-MM-dd');
        if (!dailyTicks.has(dayKey) || getHours(item.date) === 0) {
          dailyTicks.set(dayKey, item.timestamp);
        }
      });
      ticks.push(...Array.from(dailyTicks.values()));
    } else if (daysDiff <= 30) { // 10-30 days: every 2nd day
      let lastPushedDate: Date | null = null;
      chartData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= 2) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
    } else { // More than 30 days: every Nth day (e.g. 3rd, 7th)
      let step = 3;
      if (daysDiff > 90) step = 7; // weekly for very long ranges
      let lastPushedDate: Date | null = null;
      chartData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= step) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
    }
    
    // Ensure there's at least one tick if chartData is not empty
    if (ticks.length === 0 && chartData.length > 0) {
        ticks.push(chartData[0].timestamp);
    }
    // Ensure the last data point is a tick if there's more than one point
    if (chartData.length > 1 && ticks[ticks.length -1] !== chartData[chartData.length -1].timestamp) {
        const lastTimestamp = chartData[chartData.length -1].timestamp;
        if (!ticks.includes(lastTimestamp)) {
             ticks.push(lastTimestamp);
        }
    }

    return ticks.filter((t, i, arr) => arr.indexOf(t) === i); // Return unique ticks
  };
  
  const xAxisTicks = getXAxisTicks();
  
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
    const firstDate = chartData.length > 0 ? chartData[0].date : new Date();
    const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : new Date();
    const daysDiff = chartData.length > 0 ? differenceInDays(lastDate, firstDate) : 0;

    switch (averaging) {
      case 'monthly':
        return format(date, 'MMM yy', { locale: de });
      case 'daily':
        // If many days, only show month for first tick of a new month
        if (daysDiff > 30 && date.getDate() === 1) return format(date, 'MMM', { locale: de });
        return format(date, 'dd.MM.', { locale: de });
      case 'daily-cycle':
        return format(date, 'HH:00', { locale: de });
      case 'hourly':
         if (daysDiff > 2) return format(date, 'dd.MM. HH:00', { locale: de });
        return format(date, 'HH:00', { locale: de });
      default: // Auto mode based on daysDiff (not specific averaging)
        if (daysDiff < 1) { // Less than a day
            return format(date, 'HH:mm', { locale: de });
        } else if (daysDiff < 3) { // Less than 3 days
            return format(date, 'dd.MM. HH:00', { locale: de });
        } else if (daysDiff <= 10) {
            return format(date, 'dd.MM.', { locale: de });
        } else if (daysDiff <= 90) { // Up to ~3 months
            if (date.getDate() === 1 || xAxisTicks.find(t => parseISO(t).valueOf() === date.valueOf() && differenceInDays(date, chartData[0].date) < 7 )) { // First day of month or first tick
                 return format(date, 'dd.MM.', { locale: de }); // Show day and month for first few/month starts
            }
            return format(date, 'dd.MM.', { locale: de }); // Otherwise just day for denser ticks
        } else { // More than 3 months
            return format(date, 'MMM yy', { locale: de });
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
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      name: string;
      color: string;
      dataKey: string;
    }>;
    label?: string;
  }
  
  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
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
          formattedDate = format(date, 'HH:00 \'Uhr\'', { locale: de });
          break;
        case 'hourly':
          formattedDate = format(date, 'dd.MM.yyyy HH:00 \'Uhr\'', { locale: de });
          break;
        default:
          formattedDate = format(date, 'dd.MM.yyyy HH:mm', { locale: de });
      }
      
      return (
        <div className="bg-card p-3 border border-border rounded-md shadow-md">
          <p className="font-medium text-sm mb-2">{formattedDate}</p>
          {payload.map((entry, index: number) => {
            if (!entry.value) return null;
            
            const value = entry.value;
            let unit = '';
            let name = entry.name;
            
            if (entry.dataKey === 'price') {
              unit = priceUnitLabel;
              name = showSpotPriceWithTax ? 'Strompreis (inkl. USt.)' : 'Strompreis';
            } else if (entry.dataKey === 'consumption') {
              unit = 'kWh';
              name = 'Verbrauch';
            } else if (entry.dataKey === 'cost') {
              unit = '€';
              name = 'Kosten';
            } else if (entry.dataKey === 'contractEnergyPrice') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: Nettostromkosten`;
            } else if (entry.dataKey === 'contractNetworkCosts') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: inkl. Netzkosten`;
            } else if (entry.dataKey === 'contractTotalPriceTaxed') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: inkl. Steuern`;
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

  // Simplified renderMonthBands function - avoiding NaN errors
  const renderMonthBands = () => {
    if (!showMonthSeparators || chartData.length === 0) {
      return null;
    }
    
    const monthElements: React.JSX.Element[] = [];
    const processedMonths = new Set<string>();

    // Group all data points by month - don't rely on isFirstDataPointOfMonth flag
    const monthGroups = new Map<string, ExtendedChartDataPoint[]>();
    chartData.forEach(dataPoint => {
      const monthKey = format(dataPoint.date, 'yyyy-MM');
      if (!monthGroups.has(monthKey)) {
        monthGroups.set(monthKey, []);
      }
      monthGroups.get(monthKey)!.push(dataPoint);
    });

    // Sort months chronologically and process each one
    const sortedMonthKeys = Array.from(monthGroups.keys()).sort();
    
    sortedMonthKeys.forEach((monthKey, index) => {
      if (processedMonths.has(monthKey)) return;
      processedMonths.add(monthKey);
      
      const monthDataPoints = monthGroups.get(monthKey)!;
      if (monthDataPoints.length === 0) return;

      const monthName = format(monthDataPoints[0].date, 'MMMM', { locale: de });
      const firstTimestamp = monthDataPoints[0].timestamp;
      const lastTimestamp = monthDataPoints[monthDataPoints.length - 1].timestamp;
      
      // Add month marker line at the beginning
      monthElements.push(
        <ReferenceLine
          key={`month-marker-${monthKey}`}
          x={firstTimestamp}
          yAxisId="price" 
          stroke="var(--month-label-color)"
          strokeWidth={2}
          strokeOpacity={0.6}
          ifOverflow="hidden"
        />
      );
      
      // Add background area for alternating months
      if (index % 2 === 0) {
        monthElements.push(
          <ReferenceArea
            key={`month-area-${monthKey}`}
            x1={firstTimestamp}
            x2={lastTimestamp}
            yAxisId="price"
            fill="var(--month-band-fill-color)"
            fillOpacity={0.3}
            ifOverflow="hidden"
          />
        );
      }
      
      // Add centered label for ALL months using middle data point
      const middleIndex = Math.floor(monthDataPoints.length / 2);
      const middleDataPoint = monthDataPoints[middleIndex];
      
      monthElements.push(
        <ReferenceLine
          key={`month-label-${monthKey}`}
          x={middleDataPoint.timestamp}
          yAxisId="price" 
          stroke="transparent"
          strokeWidth={0}
          ifOverflow="hidden"
          label={{
            value: monthName,
            position: 'insideTop',
            fill: 'var(--month-label-color)',
            fontSize: 12,
            fontWeight: 'bold',
            offset: 10,
            textAnchor: 'middle'
          }}
        />
      );
    });
     
    return <>{monthElements}</>; 
  };

  // Renamed from renderWeekBands and uses ReferenceLine for week markers
  const renderWeekMarkers = () => {
    if (!shouldShowWeekSeparators || chartData.length === 0) {
      return null;
    }
    const weekMarkers: React.JSX.Element[] = [];
    chartData.forEach((item) => { // No index needed as we use item.timestamp
        if (item.isFirstDataPointOfWeek) {
            weekMarkers.push(
                <ReferenceLine
                    key={`week-marker-${item.timestamp}`}
                    x={item.timestamp}
                    yAxisId="price" 
                    stroke="var(--week-marker-color)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4" 
                    strokeOpacity={0.75}
                    ifOverflow="hidden"
                    label={{
                        value: `KW ${getISOWeek(item.date)}`,
                        position: 'insideTop',
                        fill: 'var(--week-label-color)',
                        fontSize: 10,
                        textAnchor: 'middle', /* Ensure centering if not default for ReferenceLine label */
                    }}
                />
            );
        }
    });
    return <>{weekMarkers}</>;
  };

  // Updated renderDayBands function using ReferenceArea like months
  const renderDayBands = () => {
    if (!shouldShowDaySeparators || chartData.length <= 1) {
      return null;
    }
    const dayReferenceAreas: React.JSX.Element[] = [];
    let isGray = true; // For alternating fill
    const processedDays = new Set<string>(); // Tracks yyyy-MM-dd to ensure each day gets one band

    for (let i = 0; i < chartData.length; i++) {
        const currentDataPointDate = chartData[i].date;
        const dayKey = format(currentDataPointDate, 'yyyy-MM-dd');

        if (!processedDays.has(dayKey)) {
            // First time encountering this day in the loop
            processedDays.add(dayKey);

            // Find all data points actually belonging to this specific day (yyyy-MM-dd)
            const pointsInThisExactDay = chartData.filter(dp => format(dp.date, 'yyyy-MM-dd') === dayKey);
            
            if (pointsInThisExactDay.length > 0) {
                const firstTimestampInDay = pointsInThisExactDay[0].timestamp;
                const lastTimestamp = new Date(pointsInThisExactDay[pointsInThisExactDay.length - 1].timestamp);
                // Add one hour because we want to include the last hour in the timeframe
                lastTimestamp.setHours(lastTimestamp.getHours() + 1);
                const lastTimestampInDay = lastTimestamp.toISOString();

                // Create ReferenceArea for alternating days
                if (isGray) {
                    dayReferenceAreas.push(
                        <ReferenceArea
                            key={`day-area-${dayKey}`}
                            x1={firstTimestampInDay}
                            x2={lastTimestampInDay}
                            yAxisId="price"
                            fill="var(--day-band-fill-color)"
                            fillOpacity={0.15}
                            ifOverflow="hidden"
                        />
                    );
                }
                // Toggle for the next distinct day
                isGray = !isGray; 
            }
        }
    }
    // The returned elements are directly used by Recharts
    return <>{dayReferenceAreas}</>; 
  };

  return (
    <div className="space-y-2 md:space-y-4">
      <div className="w-full h-[400px] md:h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ 
              top: 20, 
              right: window.innerWidth < 768 ? 3 : 10, 
              left: window.innerWidth < 768 ? 3 : 10, 
              bottom: 20 
            }}
            className="bg-card md:border border-none"
          >
            <defs>
              <style type="text/css">
                {`
                  .recharts-cartesian-grid-horizontal line,
                  .recharts-cartesian-grid-vertical line {
                    stroke: var(--border);
                    opacity: 0.3;
                  }
                  .recharts-legend-wrapper {
                    bottom: 5px !important;
                  }
                  .recharts-xaxis .recharts-label {
                    transform: translateY(5px);
                  }
                  .recharts-month-label {
                    font-size: 12px;
                    fill: var(--month-label-color);
                    font-weight: bold;
                  }
                  .recharts-week-label {
                    font-size: 10px;
                    fill: var(--week-label-color);
                    text-anchor: middle; /* Ensure centering if not default for ReferenceLine label */
                  }
                  .recharts-month-refarea-label {
                    font-size: 12px;
                    fill: var(--month-label-color);
                    font-weight: bold;
                  }
                `}
              </style>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ paddingTop: '0px', paddingBottom: '10px' }}
            />
            
            {/* Background bands for months, weeks, days */}
            {renderMonthBands()}
            {renderWeekMarkers()}
            {renderDayBands()}
            
            <XAxis 
              dataKey="timestamp" 
              ticks={xAxisTicks}
              tickFormatter={formatXAxis}
              label={{ value: averaging === 'daily-cycle' ? 'Stunde des Tages' : getXAxisLabel(), position: 'bottom', offset: 0 }}
              minTickGap={ averaging === 'daily-cycle' ? 15 : 30} // Smaller gap for hourly view
              height={30}
              tick={{ fontSize: 12 }}
            />
            
            <YAxis
              yAxisId="price"
              domain={['auto', 'auto']}
              width={40}
              label={{ 
                value: priceUnitLabel, 
                angle: -90, 
                position: 'left',
                offset: -5,
              }}
            />
            {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
              <YAxis
                yAxisId="consumption"
                orientation="right"
                label={{ value: 'kWh', angle: 90, position: 'right' }}
              />
            )}
            {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && showCost && (
              <YAxis
                yAxisId="cost"
                orientation="right"
                label={{ value: '€', angle: 90, position: 'right', offset: 40 }}
              />
            )}
            <Tooltip content={<CustomTooltip />} />
            
            <Line
              key="price-line"
              type="monotone"
              dataKey="price"
              name={showSpotPriceWithTax ? "Strompreis (inkl. USt.)" : "Strompreis"}
              yAxisId="price"
              stroke="#e53935"
              strokeWidth={2}
              dot={energyPrices.length > 100 ? false : {}}
              activeDot={{ r: 5 }}
              animationDuration={200}
            />
            {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
              <Line
                key="consumption-line"
                type="monotone"
                dataKey="consumption"
                name="Verbrauch"
                yAxisId="consumption"
                stroke="#4285f4"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
                animationDuration={200}
                hide={!showConsumption}
              />
            )}
            {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && (
              <Line
                key="cost-line"
                type="monotone"
                dataKey="cost"
                name="Kosten"
                yAxisId="cost"
                stroke="#34a853"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
                animationDuration={200}
                hide={!showCost}
              />
            )}
            {selectedContract && (
              <Line
                key="contractEnergyPrice-line"
                type="monotone"
                dataKey="contractEnergyPrice"
                name={`${selectedContract.provider} ${selectedContract.name} - Nettostromkosten`}
                yAxisId="price"
                stroke="#9c27b0"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showBasePrice}
              />
            )}
            {selectedContract && (
              <Line
                key="contractNetworkCosts-line"
                type="monotone"
                dataKey="contractNetworkCosts"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Netzkosten`}
                yAxisId="price"
                stroke="#ff9800"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showNetworkCosts}
              />
            )}
            {selectedContract && (
              <Line
                key="contractTotalPriceTaxed-line"
                type="monotone"
                dataKey="contractTotalPriceTaxed"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Steuern`}
                yAxisId="price"
                stroke="#795548"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showWithTaxes}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {chartData.length > 0 && (
      <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
        <div className="text-sm font-medium">Zeitraum-Highlights:</div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-day-separators" 
              checked={shouldShowDaySeparators} 
              onCheckedChange={handleCheckedChange(setShowDaySeparators)}
            />
            <Label htmlFor="show-day-separators" className="text-sm">Tage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-week-separators" 
              checked={shouldShowWeekSeparators} 
              onCheckedChange={handleCheckedChange(setShowWeekSeparators)}
            />
            <Label htmlFor="show-week-separators" className="text-sm">Wochen</Label>
          </div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="show-month-separators" 
            checked={showMonthSeparators} 
            onCheckedChange={handleCheckedChange(setShowMonthSeparators)}
          />
          <Label htmlFor="show-month-separators" className="text-sm">Monate</Label>
        </div>
      </div>
      )}
      
      {selectedContract && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
          <div className="text-sm font-medium">{selectedContract.provider} - {selectedContract.name}: </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-base-price" 
              checked={showBasePrice} 
              onCheckedChange={handleCheckedChange(setShowBasePrice)}
            />
            <Label htmlFor="show-base-price" className="text-sm">Nettostromkosten</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-network-costs" 
              checked={showNetworkCosts} 
              onCheckedChange={handleCheckedChange(setShowNetworkCosts)}
            />
            <Label htmlFor="show-network-costs" className="text-sm">Inkl. Netzkosten</Label>
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
      
      {/* Add new tax toggle section */}
      <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
        <div className="text-sm font-medium">Preisdarstellung:</div>
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="show-spot-price-with-tax" 
            checked={showSpotPriceWithTax} 
            onCheckedChange={handleCheckedChange(setShowSpotPriceWithTax)}
          />
          <Label htmlFor="show-spot-price-with-tax" className="text-sm">Strompreis inkl. USt.</Label>
        </div>
      </div>
    </div>
  );
};

export default EnergyChart;
