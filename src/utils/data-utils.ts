
import { AveragingOption, EnergyPrice, FilterOptions, SmartMeterData } from "@/types/energy-data";
import { decodeOptimizedBinaryEnergyPrices } from "@/utils/optimized-binary-decoder";

export const parseBinaryEnergyData = (data: ArrayBuffer): EnergyPrice[] => {
  return decodeOptimizedBinaryEnergyPrices(data);
};

export const parseSmartMeterData = (data: ArrayBuffer): SmartMeterData[] => {
  const text = new TextDecoder().decode(data).trim();

  if (!text) {
    throw new Error("Die Datei ist leer.");
  }

  if (text.startsWith("[") || text.startsWith("{")) {
    const parsed = JSON.parse(text) as unknown;
    const records = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "records" in parsed
        ? (parsed as { records: unknown }).records
        : null;

    if (!Array.isArray(records)) {
      throw new Error("JSON-Dateien müssen ein Array oder ein Objekt mit records enthalten.");
    }

    return records.map(normalizeSmartMeterRecord);
  }

  return parseSmartMeterCsv(text);
};

const normalizeSmartMeterRecord = (record: unknown): SmartMeterData => {
  if (typeof record !== "object" || record === null) {
    throw new Error("Ungültiger Smart-Meter-Datensatz.");
  }

  const values = record as Record<string, unknown>;
  const timestampValue = values.timestamp ?? values.date ?? values.datetime ?? values.time;
  const consumptionValue = values.consumption ?? values.kwh ?? values.value ?? values.energy;

  if (typeof timestampValue !== "string" && typeof timestampValue !== "number") {
    throw new Error("Smart-Meter-Datensätze benötigen einen Zeitstempel.");
  }

  const timestamp = new Date(timestampValue);
  const consumption = Number(
    typeof consumptionValue === "string"
      ? consumptionValue.replace(",", ".")
      : consumptionValue
  );

  if (Number.isNaN(timestamp.getTime()) || !Number.isFinite(consumption)) {
    throw new Error("Smart-Meter-Datensatz enthält ungültige Werte.");
  }

  return {
    timestamp: timestamp.toISOString(),
    consumption,
  };
};

const parseSmartMeterCsv = (text: string): SmartMeterData[] => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV-Dateien benötigen eine Kopfzeile und mindestens eine Datenzeile.");
  }

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim().toLowerCase());
  const timestampIndex = findHeaderIndex(headers, ["timestamp", "datetime", "date", "time", "zeitpunkt", "datum"]);
  const consumptionIndex = findHeaderIndex(headers, ["consumption", "kwh", "value", "energy", "verbrauch"]);

  if (timestampIndex === -1 || consumptionIndex === -1) {
    throw new Error("CSV-Dateien benötigen Zeitstempel- und Verbrauchsspalten.");
  }

  return lines.slice(1).map((line) => {
    const columns = line.split(delimiter).map((column) => column.trim());
    return normalizeSmartMeterRecord({
      timestamp: columns[timestampIndex],
      consumption: columns[consumptionIndex],
    });
  });
};

const findHeaderIndex = (headers: string[], names: string[]) => {
  return headers.findIndex((header) => names.includes(header));
};

// Filter energy prices by date range
export const filterByDateRange = (
  data: EnergyPrice[], 
  startDate: Date | null, 
  endDate: Date | null
): EnergyPrice[] => {
  if (!startDate && !endDate) return data;
  const inclusiveEndDate = endDate ? new Date(endDate) : null;
  if (inclusiveEndDate) {
    inclusiveEndDate.setHours(23, 59, 59, 999);
  }
  
  return data.filter(item => {
    const itemDate = new Date(item.timestamp);
    return (
      (!startDate || itemDate >= startDate) &&
      (!inclusiveEndDate || itemDate <= inclusiveEndDate)
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

export const convertEnergyPriceUnit = (
  data: EnergyPrice[],
  unit: EnergyPrice['unit']
): EnergyPrice[] => {
  return data.map((item) => {
    if (item.unit === unit) return item;

    return {
      ...item,
      price: unit === 'cent_kWh' ? item.price / 10 : item.price * 10,
      unit,
    };
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
      case 'weekly': {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        key = weekStart.toISOString().slice(0, 10);
        break;
      }
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
