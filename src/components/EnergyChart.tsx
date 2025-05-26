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
import { format, parseISO, getMonth, isMonday, getDate, getDay, differenceInDays, getHours, getMinutes, getISOWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckedState } from "@radix-ui/react-checkbox";
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

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
  contractTotalPrice?: number;
  contractTotalPriceTaxed?: number;
  fixedCosts?: number; // New property for fixed costs
  // Allow other dynamic properties if necessary, though specific props are preferred
  [key: string]: any;
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
  const { theme } = useTheme();
  // State for toggling visibility of various lines
  const [showBasePrice, setShowBasePrice] = useState(true);
  const [showTotalPrice, setShowTotalPrice] = useState(true);
  const [showWithTaxes, setShowWithTaxes] = useState(true);
  const [showConsumption, setShowConsumption] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [showWeekSeparators, setShowWeekSeparators] = useState(true);
  const [showMonthSeparators, setShowMonthSeparators] = useState(true);
  const [showDaySeparators, setShowDaySeparators] = useState(false);
  const [showSpotPriceWithTax, setShowSpotPriceWithTax] = useState(false);
  const [showFixedCosts, setShowFixedCosts] = useState(false);

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
        (item as any).isFirstDataPointOfDay = true;
        dayProcessed.set(dayKey, true);
      } else {
        (item as any).isFirstDataPointOfDay = false;
      }

      const weekOfYearKey = format(date, 'yyyy-II');
      if (getDay(date) === 1) {
        if (!weekProcessed.has(weekOfYearKey)) {
          (item as any).isFirstDataPointOfWeek = true;
          weekProcessed.set(weekOfYearKey, true);
        } else {
          (item as any).isFirstDataPointOfWeek = false;
        }
      } else {
        (item as any).isFirstDataPointOfWeek = false;
      }

      const monthKey = format(date, 'yyyy-MM');
      if (!monthProcessed.has(monthKey)) {
        (item as any).isFirstDataPointOfMonth = true;
        monthProcessed.set(monthKey, true);
      } else {
        (item as any).isFirstDataPointOfMonth = false;
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
          (item as any).consumption = consumption;
          if (showTotalCost) {
            const price = item.price;
            const pricePerKWh = item.unit === 'EUR_MWh' ? price / 1000 : price / 100;
            (item as any).cost = consumption * pricePerKWh;
          }
        }
      });
    }
    
    if (selectedContract) {
      const energyPriceInCents = selectedContract.energyPrice;
      let divisor = 1;
      switch(averaging) {
        case 'monthly': divisor = 30 * 24; break;
        case 'daily': divisor = 24; break;
        case 'daily-cycle': divisor = 1; break;
        case 'hourly': divisor = 1; break;
        default: divisor = 1;
      }
      
      internalChartData.forEach(item => {
        if (item.unit === 'EUR_MWh') {
          (item as any).contractEnergyPrice = energyPriceInCents * 10;
        } else {
          (item as any).contractEnergyPrice = energyPriceInCents;
        }
        
        const annualConsumption = showSmartMeterData && smartMeterData 
          ? smartMeterData.reduce((sum, data) => sum + data.consumption, 0) * (365 / (smartMeterData.length / 24))
          : 3500;
        
        const basePricePerUnit = selectedContract.basePrice / (365 * 24) * divisor;
        const networkCostsPerUnit = selectedContract.networkCosts(annualConsumption) / (365 * 24) * divisor;
        const fixedCostPerUnit = basePricePerUnit + networkCostsPerUnit;
        let effectiveCostPerKwh;
        
        if (averaging === 'daily-cycle') {
          const hour = parseISO(item.timestamp).getHours();
          let hourlyWeight = 1;
          if (hour >= 7 && hour <= 9) hourlyWeight = 1.5;
          else if (hour >= 17 && hour <= 22) hourlyWeight = 2.0;
          else if (hour >= 23 || hour <= 6) hourlyWeight = 0.5;
          const adjustedFixedCostPerUnit = fixedCostPerUnit * hourlyWeight;
          const referenceCons = 0.5;
          if (item.unit === 'EUR_MWh') {
            effectiveCostPerKwh = energyPriceInCents * 10 + (adjustedFixedCostPerUnit * 1000 / referenceCons);
          } else {
            effectiveCostPerKwh = energyPriceInCents + (adjustedFixedCostPerUnit * 100 / referenceCons);
          }
        } else {
          const referenceCons = averaging === 'monthly' ? 250 :
                              (averaging === 'daily' ? 8 : 0.5);
          if (item.unit === 'EUR_MWh') {
            effectiveCostPerKwh = energyPriceInCents * 10 + (fixedCostPerUnit * 1000 / referenceCons);
          } else {
            effectiveCostPerKwh = energyPriceInCents + (fixedCostPerUnit * 100 / referenceCons);
          }
        }
        (item as any).contractTotalPrice = effectiveCostPerKwh;
        (item as any).contractTotalPriceTaxed = effectiveCostPerKwh * 1.2;
      });
    }
    return internalChartData;
  }, [energyPrices, smartMeterData, showSmartMeterData, showTotalCost, selectedContract, averaging, showSpotPriceWithTax, showFixedCosts]);

  // Calculate data timespan in days
  const dataTimeSpanDays = chartData.length > 0 
    ? differenceInDays(chartData[chartData.length - 1].date, chartData[0].date)
    : 0;

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
              name = `${selectedContract?.provider} ${selectedContract?.name}: Arbeitspreis`;
            } else if (entry.dataKey === 'contractTotalPrice') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
              name = `${selectedContract?.provider} ${selectedContract?.name}: inkl. Fixkosten`;
            } else if (entry.dataKey === 'contractTotalPriceTaxed') {
              unit = energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh';
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

  // Updated renderMonthBands function
  const renderMonthBands = () => {
    if (!showMonthSeparators || chartData.length === 0) {
      return null;
    }
    const monthReferenceAreas: JSX.Element[] = [];
    let isGray = true; // For alternating fill/label display
    const processedMonths = new Set<string>(); // Tracks yyyy-MM to ensure each month gets one band

    for (let i = 0; i < chartData.length; i++) {
        const currentDataPointDate = chartData[i].date;
        const monthKey = format(currentDataPointDate, 'yyyy-MM');

        if (!processedMonths.has(monthKey)) {
            // First time encountering this month in the loop
            processedMonths.add(monthKey);

            // Find all data points actually belonging to this specific month (yyyy-MM)
            const pointsInThisExactMonth = chartData.filter(dp => format(dp.date, 'yyyy-MM') === monthKey);
            
            if (pointsInThisExactMonth.length > 0) {
                const firstTimestampInMonth = pointsInThisExactMonth[0].timestamp;
                const lastTimestamp = new Date(pointsInThisExactMonth[pointsInThisExactMonth.length - 1].timestamp);
                // Add one hour because we want to include the last hour in the timeframe
                lastTimestamp.setHours(lastTimestamp.getHours() + 1);
                const lastTimestampInMonth = lastTimestamp.toISOString();
                const monthName = format(pointsInThisExactMonth[0].date, 'MMMM', { locale: de });

                if (isGray) {
                    monthReferenceAreas.push(
                        <ReferenceArea
                            key={`month-area-${monthKey}`}
                            x1={firstTimestampInMonth}
                            x2={lastTimestampInMonth}
                            yAxisId="price" // Target the main price Y-axis
                            fill="var(--month-band-fill-color)"
                            fillOpacity={0.3}
                            ifOverflow="hidden" // Clip to plot area
                            label={{
                                value: monthName,
                                position: 'insideTop',
                                fill: 'var(--month-label-color)',
                                fontSize: 12,
                                fontWeight: 'bold',
                                dy: 10, // Adjust vertical position from 'insideTop'
                                className: 'recharts-month-refarea-label' // For specific styling if needed
                            }}
                        />
                    );
                }
                // This band (or absence of band if transparent) is done, toggle for the next distinct month
                isGray = !isGray; 
            }
        }
    }
    // The returned elements are directly used by Recharts
    return <>{monthReferenceAreas}</>; 
  };

  // Renamed from renderWeekBands and uses ReferenceLine for week markers
  const renderWeekMarkers = () => {
    if (!showWeekSeparators || chartData.length === 0) {
      return null;
    }
    const weekMarkers: JSX.Element[] = [];
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

  // New renderDayMarkers to renderDayBands
  const renderDayBands = () => {
    if (!showDaySeparators || chartData.length <= 1) {
      return null;
    }
    const bands: JSX.Element[] = [];
    const dayStarts: number[] = [];
    chartData.forEach((item, index) => {
        if (item.isFirstDataPointOfDay) {
            dayStarts.push(index);
        }
    });

    dayStarts.forEach((startIndex, i) => {
        const endIndex = (i + 1 < dayStarts.length) ? dayStarts[i+1] : chartData.length;
        // Removed redundant condition: if (chartData.length -1 === 0) return;
        if (chartData.length -1 === 0 && startIndex / (chartData.length-1) > 1) return; // Defensive, but main dead code removed. The original dead code was just `if (chartData.length -1 === 0) return;`
        bands.push(
            <rect
                key={`day-band-${startIndex}`}
                x={`${(startIndex / (chartData.length - 1)) * 100}%`}
                y="0"
                width={`${((endIndex - startIndex) / (chartData.length - 1)) * 100}%`}
                height="100%"
                fill="var(--day-band-fill-color)"
                fillOpacity={0.15}
            />
        );
    });
    return <g className="day-bands">{bands}</g>;
  };

  return (
    <div className="space-y-4">
      <div className="w-full h-[500px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 10, left: 10, bottom: 20 }}
            className="bg-card border"
          >
            <defs>
              <style type="text/css">
                {`
                  :root {
                    --month-band-fill-color: ${theme === 'dark' ? '#444444' : '#cccccc'};
                    --week-marker-color: ${theme === 'dark' ? 'rgba(130,130,130,0.75)' : 'rgba(140,140,140,0.75)'};
                    --day-band-fill-color: ${theme === 'dark' ? '#666666' : '#bbbbbb'};
                    --month-label-color: ${theme === 'dark' ? '#eeeeee' : '#333333'};
                    --week-label-color: ${theme === 'dark' ? '#cccccc' : '#444444'};
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
                value: energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh', 
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
                name={`${selectedContract.provider} ${selectedContract.name} - Arbeitspreis`}
                yAxisId="price"
                stroke="#9c27b0"
                strokeWidth={4}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showBasePrice}
              />
            )}
            {selectedContract && (
              <Line
                key="contractTotalPrice-line"
                type="monotone"
                dataKey="contractTotalPrice"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Fixkosten`}
                yAxisId="price"
                stroke="#ff9800"
                strokeWidth={4}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showTotalPrice}
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
                strokeWidth={4}
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
              checked={showDaySeparators} 
              onCheckedChange={handleCheckedChange(setShowDaySeparators)}
            />
            <Label htmlFor="show-day-separators" className="text-sm">Tage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="show-week-separators" 
              checked={showWeekSeparators} 
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
        <div className="flex items-center space-x-2">
          <Checkbox 
            id="show-fixed-costs" 
            checked={showFixedCosts} 
            onCheckedChange={handleCheckedChange(setShowFixedCosts)}
          />
          <Label htmlFor="show-fixed-costs" className="text-sm">Fixkosten anzeigen</Label>
        </div>
      </div>
    </div>
  );
};

export default EnergyChart;
