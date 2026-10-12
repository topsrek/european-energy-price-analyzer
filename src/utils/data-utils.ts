
import { AveragingOption, EnergyPrice, FilterOptions, SmartMeterData } from "@/types/energy-data";
import {
  MARKET_TIMEZONE,
  getMarketDateParts,
  getMarketDayEnd,
  getMarketDayKey,
  getMarketDayStart,
  getMarketTime,
  getMarketWeekStartKey,
} from "@/utils/market-time";

const MS_PER_HOUR = 3_600_000;

/**
 * Earliest/latest timestamp (epoch ms) of a price series. Uses a loop instead of
 * Math.min(...arr)/Math.max(...arr), which throws a RangeError on large arrays
 * (Safari limits spread arguments to 65,536).
 */
export const getTimestampBounds = (
  data: EnergyPrice[]
): { earliest: number; latest: number } | null => {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const record of data) {
    const time = new Date(record.timestamp).getTime();
    if (Number.isNaN(time)) continue;
    if (time < earliest) earliest = time;
    if (time > latest) latest = time;
  }

  return Number.isFinite(earliest) ? { earliest, latest } : null;
};

/** ISO timestamp of the latest record, or '' for an empty series. */
export const getLatestTimestamp = (data: EnergyPrice[]): string => {
  const bounds = getTimestampBounds(data);
  return bounds ? new Date(bounds.latest).toISOString() : '';
};

/** Convert a single price value between €/MWh and ct/kWh (1 ct/kWh = 10 €/MWh). */
export const convertPriceValue = (
  value: number,
  from: EnergyPrice['unit'],
  to: EnergyPrice['unit']
): number => {
  if (from === to) return value;
  const converted = to === 'cent_kWh' ? value / 10 : value * 10;
  // Strip binary floating-point noise such as 0.8300000000000001.
  return Math.round(converted * 1e6) / 1e6;
};

/**
 * Parse an uploaded smart-meter export (JSON or CSV). Timestamps without an explicit offset are
 * market wall-clock time in `timeZone`, independent of the viewer's time zone.
 */
export const parseSmartMeterData = (data: ArrayBuffer, timeZone: string = MARKET_TIMEZONE): SmartMeterData[] => {
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

    return records.map((record) => normalizeSmartMeterRecord(record, timeZone));
  }

  return parseSmartMeterCsv(text, timeZone);
};

const EXPLICIT_OFFSET_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const ISO_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?$/;
const GERMAN_LOCAL_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2})(?::\d{2})?)?$/;

const marketWallClock = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number => {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return Number.NaN;
  // Reject rolled-over dates such as 31.02.
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return Number.NaN;
  return getMarketTime(timeZone, year, month - 1, day, hour, minute);
};

/**
 * Epoch ms of a smart-meter timestamp. Values with an explicit offset (or epoch numbers) are
 * absolute; `yyyy-MM-dd[ HH:mm[:ss]]` and German `dd.MM.yyyy[ HH:mm[:ss]]` are market wall-clock
 * time. Anything else is rejected instead of being guessed by the browser's date parser.
 */
export const parseSmartMeterTimestamp = (value: string | number, timeZone: string): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  const text = value.trim();

  const iso = ISO_LOCAL_RE.exec(text);
  if (iso) {
    const [, y, m, d, h = "0", min = "0"] = iso;
    return marketWallClock(timeZone, Number(y), Number(m), Number(d), Number(h), Number(min));
  }

  const german = GERMAN_LOCAL_RE.exec(text);
  if (german) {
    const [, d, m, y, h = "0", min = "0"] = german;
    return marketWallClock(timeZone, Number(y), Number(m), Number(d), Number(h), Number(min));
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text) && EXPLICIT_OFFSET_RE.test(text)) {
    return Date.parse(text);
  }

  return Number.NaN;
};

const normalizeSmartMeterRecord = (record: unknown, timeZone: string): SmartMeterData => {
  if (typeof record !== "object" || record === null) {
    throw new Error("Ungültiger Smart-Meter-Datensatz.");
  }

  const values = record as Record<string, unknown>;
  const timestampValue = values.timestamp ?? values.date ?? values.datetime ?? values.time;
  const consumptionValue = values.consumption ?? values.kwh ?? values.value ?? values.energy;

  if (typeof timestampValue !== "string" && typeof timestampValue !== "number") {
    throw new Error("Smart-Meter-Datensätze benötigen einen Zeitstempel.");
  }

  const time = parseSmartMeterTimestamp(timestampValue, timeZone);
  const consumption = Number(
    typeof consumptionValue === "string"
      ? consumptionValue.replace(",", ".")
      : consumptionValue
  );

  if (Number.isNaN(time)) {
    throw new Error(
      `Ungültiger Zeitstempel „${timestampValue}“. Unterstützt: yyyy-MM-dd HH:mm, dd.MM.yyyy HH:mm oder ISO 8601 mit Zeitzone.`
    );
  }

  if (!Number.isFinite(consumption)) {
    throw new Error("Smart-Meter-Datensatz enthält ungültige Werte.");
  }

  return {
    timestamp: new Date(time).toISOString(),
    consumption,
  };
};

const parseSmartMeterCsv = (text: string, timeZone: string): SmartMeterData[] => {
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
    }, timeZone);
  });
};

const findHeaderIndex = (headers: string[], names: string[]) => {
  return headers.findIndex((header) => names.includes(header));
};

// Filter energy prices by date range. The dates carry calendar days (local y/m/d) that are
// interpreted in the market time zone: start 00:00 through the end of the end day.
export const filterByDateRange = (
  data: EnergyPrice[], 
  startDate: Date | null, 
  endDate: Date | null,
  timeZone: string
): EnergyPrice[] => {
  if (!startDate && !endDate) return data;
  const startTime = startDate ? getMarketDayStart(startDate, timeZone) : Number.NEGATIVE_INFINITY;
  const endTime = endDate ? getMarketDayEnd(endDate, timeZone) : Number.POSITIVE_INFINITY;
  
  return data.filter(item => {
    const time = Date.parse(item.timestamp);
    return time >= startTime && time <= endTime;
  });
};

/**
 * Filter by month, weekday, hour, day of month and ISO week (all in market time). An empty
 * selection matches nothing. Dimensions that the averaging mode makes meaningless (and the UI
 * disables) are ignored: months for monthly, weekdays for daily, hours for daily-cycle averages.
 */
export const applyFilters = (
  data: EnergyPrice[],
  filters: FilterOptions,
  timeZone: string,
  averaging?: AveragingOption
): EnergyPrice[] => {
  const months = averaging === 'monthly' ? null : new Set(filters.months);
  const weekdays = averaging === 'daily' ? null : new Set(filters.weekdays);
  const hours = averaging === 'daily-cycle' ? null : new Set(filters.hours);
  const daysOfMonth = new Set(filters.daysOfMonth);
  const weeksOfYear = new Set(filters.weeksOfYear);

  return data.filter(item => {
    const { month, weekday, hour, day, isoWeek } = getMarketDateParts(item.timestamp, timeZone);

    return (
      (!months || months.has(month)) &&
      (!weekdays || weekdays.has(weekday)) &&
      (!hours || hours.has(hour)) &&
      daysOfMonth.has(day) &&
      weeksOfYear.has(isoWeek)
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

/** Market-time bucket of a timestamp for the daily/weekly/monthly/hourly averaging options. */
export const getAveragingBucketKey = (
  averaging: string,
  time: number,
  timeZone: string
): string | number => {
  // Epoch hours keep both DST fall-back hours apart.
  if (averaging === 'hourly') return Math.floor(time / MS_PER_HOUR);
  if (averaging !== 'monthly' && averaging !== 'daily' && averaging !== 'weekly') return time;
  const parts = getMarketDateParts(time, timeZone);
  if (averaging === 'monthly') return `${parts.year}-${parts.month + 1}`;
  if (averaging === 'daily') return getMarketDayKey(parts);
  return getMarketWeekStartKey(parts);
};

// Average data according to the selected option (buckets in market time)
export const calculateAverage = (
  data: EnergyPrice[], 
  averaging: AveragingOption,
  timeZone: string
): EnergyPrice[] => {
  if (averaging === 'none') return data;
  
  // For daily cycle, we average by hour of day across all days
  if (averaging === 'daily-cycle') {
    const hourlyAverages = new Map<number, { sum: number; count: number }>();
    
    // Calculate the sum and count for each hour of the day
    data.forEach(item => {
      const { hour } = getMarketDateParts(item.timestamp, timeZone);
      
      if (!hourlyAverages.has(hour)) {
        hourlyAverages.set(hour, { sum: 0, count: 0 });
      }
      
      const current = hourlyAverages.get(hour)!;
      current.sum += item.price;
      current.count += 1;
    });
    
    // Convert the Map to an array of EnergyPrice objects. Use a fixed market-time base date
    // without a DST transition so every hour 0-23 maps to a distinct timestamp.
    return Array.from(hourlyAverages.entries())
      .sort(([hourA], [hourB]) => hourA - hourB)
      .map(([hour, { sum, count }]) => {
        return {
          timestamp: new Date(getMarketTime(timeZone, 2000, 0, 1, hour)).toISOString(),
          price: sum / count,
          unit: data[0].unit,
        };
      });
  }
  
  const averages = new Map<string | number, { sum: number; count: number; timestamp: string }>();
  
  data.forEach(item => {
    const key = getAveragingBucketKey(averaging, Date.parse(item.timestamp), timeZone);
    
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

/**
 * Sum smart-meter consumption into the rows of the displayed price series, keyed by row timestamp.
 * Readings are bucketed like the prices (averaging bucket, or the price interval for raw data),
 * so 15-minute meter data adds up correctly against hourly prices and averaged buckets.
 */
export const aggregateConsumptionByPriceRow = (
  prices: EnergyPrice[],
  readings: SmartMeterData[],
  averaging: string | undefined,
  resolution: 'hourly' | 'interval',
  timeZone: string
): Map<string, number> => {
  const stepMs = resolution === 'interval' ? MS_PER_HOUR / 4 : MS_PER_HOUR;
  const keyOf = (time: number): string | number => {
    if (averaging === 'daily-cycle') return getMarketDateParts(time, timeZone).hour;
    if (averaging === 'hourly' || averaging === 'daily' || averaging === 'weekly' || averaging === 'monthly') {
      return getAveragingBucketKey(averaging, time, timeZone);
    }
    return Math.floor(time / stepMs) * stepMs;
  };

  const rowByKey = new Map<string | number, string>();
  for (const price of prices) {
    const key = keyOf(Date.parse(price.timestamp));
    if (!rowByKey.has(key)) rowByKey.set(key, price.timestamp);
  }

  // Readings coarser than the price interval (e.g. hourly meter data vs 15-minute prices) are
  // spread evenly over the price intervals they cover; a reading's timestamp is its interval start.
  const readingTimes = readings.map((reading) => Date.parse(reading.timestamp));
  const parts = Math.max(1, Math.round(smallestStep(readingTimes) / stepMs));

  const totals = new Map<string, number>();
  readings.forEach((reading, index) => {
    const share = reading.consumption / parts;
    for (let part = 0; part < parts; part += 1) {
      const row = rowByKey.get(keyOf(readingTimes[index] + part * stepMs));
      if (row === undefined) continue;
      totals.set(row, (totals.get(row) ?? 0) + share);
    }
  });
  return totals;
};

/** Smallest positive gap between the (unsorted) times, or 0 for fewer than two distinct times. */
const smallestStep = (times: number[]): number => {
  const sorted = times.filter(Number.isFinite).sort((a, b) => a - b);
  let step = Infinity;
  for (let index = 1; index < sorted.length; index += 1) {
    const gap = sorted[index] - sorted[index - 1];
    if (gap > 0 && gap < step) step = gap;
  }
  return Number.isFinite(step) ? step : 0;
};

export const generateDemoSmartMeterData = (prices: EnergyPrice[], timeZone: string): SmartMeterData[] => {
  // Generate a plausible consumption profile based on time of day
  // Morning peak (7-9), Evening peak (17-21)
  return prices.map(price => {
    const { hour } = getMarketDateParts(price.timestamp, timeZone);
    
    // Base consumption (fridge, standby, etc.)
    let consumption = 0.1 + Math.random() * 0.05;
    
    // Morning peak
    if (hour >= 7 && hour <= 9) {
      consumption += 0.3 + Math.random() * 0.4;
    }
    // Cooking / Evening peak
    else if (hour >= 17 && hour <= 21) {
      consumption += 0.4 + Math.random() * 0.6;
    }
    // Night
    else if (hour >= 23 || hour <= 5) {
      consumption = 0.05 + Math.random() * 0.05;
    }
    
    return {
      timestamp: price.timestamp,
      consumption: Number(consumption.toFixed(3))
    };
  });
};
