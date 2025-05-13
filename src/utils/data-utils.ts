
import { AveragingOption, EnergyPrice, FilterOptions, SmartMeterData } from "@/types/energy-data";

// Parse binary data file (placeholder for actual implementation)
export const parseBinaryEnergyData = (data: ArrayBuffer): EnergyPrice[] => {
  // This is a placeholder function that would actually parse the binary file
  // For testing purposes, let's just return mock data
  return generateMockEnergyPrices();
};

// Parse smart meter data (placeholder for actual implementation)
export const parseSmartMeterData = (data: ArrayBuffer): SmartMeterData[] => {
  // This is a placeholder function that would actually parse the smart meter data file
  // For testing purposes, let's just return mock data
  return generateMockSmartMeterData();
};

// Filter energy prices by date range
export const filterByDateRange = (
  data: EnergyPrice[], 
  startDate: Date | null, 
  endDate: Date | null
): EnergyPrice[] => {
  if (!startDate && !endDate) return data;
  
  return data.filter(item => {
    const itemDate = new Date(item.timestamp);
    return (
      (!startDate || itemDate >= startDate) &&
      (!endDate || itemDate <= endDate)
    );
  });
};

// Filter data by month, weekday, hour
export const applyFilters = (
  data: EnergyPrice[], 
  filters: FilterOptions
): EnergyPrice[] => {
  return data.filter(item => {
    const date = new Date(item.timestamp);
    const month = date.getMonth();
    const weekday = date.getDay();
    const hour = date.getHours();
    
    return (
      filters.months.includes(month) &&
      filters.weekdays.includes(weekday) &&
      filters.hours.includes(hour)
    );
  });
};

// Average data according to the selected option
export const calculateAverage = (
  data: EnergyPrice[], 
  averaging: AveragingOption
): EnergyPrice[] => {
  if (averaging === 'none') return data;
  
  // For daily cycle, we average by hour of day across all days
  if (averaging === 'daily-cycle') {
    const hourlyAverages = new Map<number, { sum: number; count: number }>();
    
    // Calculate the sum and count for each hour of the day
    data.forEach(item => {
      const date = new Date(item.timestamp);
      const hour = date.getHours();
      
      if (!hourlyAverages.has(hour)) {
        hourlyAverages.set(hour, { sum: 0, count: 0 });
      }
      
      const current = hourlyAverages.get(hour)!;
      current.sum += item.price;
      current.count += 1;
    });
    
    // Convert the Map to an array of EnergyPrice objects
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0); // Set to start of day
    
    return Array.from(hourlyAverages.entries())
      .sort(([hourA], [hourB]) => hourA - hourB)
      .map(([hour, { sum, count }]) => {
        const timestamp = new Date(baseDate);
        timestamp.setHours(hour);
        return {
          timestamp: timestamp.toISOString(),
          price: sum / count,
          unit: data[0].unit,
        };
      });
  }
  
  const averages = new Map<string, { sum: number; count: number; timestamp: string }>();
  
  data.forEach(item => {
    const date = new Date(item.timestamp);
    let key: string;
    
    switch(averaging) {
      case 'monthly':
        key = `${date.getFullYear()}-${date.getMonth() + 1}`;
        break;
      case 'daily':
        key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
        break;
      case 'hourly':
        key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
        break;
      default:
        key = item.timestamp;
    }
    
    if (!averages.has(key)) {
      averages.set(key, { sum: 0, count: 0, timestamp: item.timestamp });
    }
    
    const current = averages.get(key)!;
    current.sum += item.price;
    current.count += 1;
  });
  
  return Array.from(averages.values()).map(({ sum, count, timestamp }) => ({
    timestamp,
    price: sum / count,
    unit: data[0].unit,
  }));
};

// Calculate total cost based on energy prices and consumption
export const calculateTotalCost = (
  prices: EnergyPrice[],
  consumption: SmartMeterData[]
): number => {
  // Create a map of timestamps to prices for quick lookup
  const priceMap = new Map<string, number>();
  prices.forEach(price => {
    priceMap.set(price.timestamp, price.price);
  });
  
  // Calculate total cost
  return consumption.reduce((total, data) => {
    const price = priceMap.get(data.timestamp);
    if (price === undefined) return total;
    
    // Convert price from €/MWh to €/kWh if needed
    const pricePerKWh = prices[0].unit === 'EUR_MWh' ? price / 1000 : price / 100;
    
    return total + (data.consumption * pricePerKWh);
  }, 0);
};

// Generate mock energy price data for development
export const generateMockEnergyPrices = (): EnergyPrice[] => {
  const prices: EnergyPrice[] = [];
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(now.getFullYear() - 1);
  
  // Generate hourly data for the last year
  let currentDate = new Date(oneYearAgo);
  while (currentDate <= now) {
    const basePrice = 5 + Math.sin(currentDate.getHours() / 24 * Math.PI * 2) * 2; // Daily pattern
    const seasonalFactor = 1 + Math.sin((currentDate.getMonth() / 12) * Math.PI * 2) * 0.3; // Seasonal pattern
    const randomFactor = 0.8 + Math.random() * 0.4; // Random variation
    
    const price = basePrice * seasonalFactor * randomFactor;
    
    prices.push({
      timestamp: currentDate.toISOString(),
      price,
      unit: 'cent_kWh'
    });
    
    // Advance to next hour
    currentDate.setHours(currentDate.getHours() + 1);
  }
  
  return prices;
};

// Generate mock smart meter data for development
export const generateMockSmartMeterData = (): SmartMeterData[] => {
  const data: SmartMeterData[] = [];
  const now = new Date();
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(now.getMonth() - 1);
  
  // Generate hourly data for the last month
  let currentDate = new Date(oneMonthAgo);
  while (currentDate <= now) {
    const hour = currentDate.getHours();
    
    // Create a realistic consumption pattern with higher usage in mornings and evenings
    let baseConsumption = 0.2; // Base load
    
    // Morning peak (7-9 AM)
    if (hour >= 7 && hour <= 9) {
      baseConsumption += 0.8;
    } 
    // Midday (10 AM - 4 PM)
    else if (hour >= 10 && hour <= 16) {
      baseConsumption += 0.4;
    }
    // Evening peak (5 PM - 10 PM)
    else if (hour >= 17 && hour <= 22) {
      baseConsumption += 1.2;
    }
    // Night (11 PM - 6 AM)
    else {
      baseConsumption += 0.1;
    }
    
    // Weekend vs weekday
    const dayOfWeek = currentDate.getDay();
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 1.2 : 1.0;
    
    // Random variation
    const randomFactor = 0.8 + Math.random() * 0.4;
    
    const consumption = baseConsumption * weekendFactor * randomFactor;
    
    data.push({
      timestamp: currentDate.toISOString(),
      consumption
    });
    
    // Advance to next hour
    currentDate.setHours(currentDate.getHours() + 1);
  }
  
  return data;
};
