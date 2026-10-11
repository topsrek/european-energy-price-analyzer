import { tz, tzOffset } from '@date-fns/tz';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Market-time helpers.
 *
 * Price timestamps are UTC instants, but every calendar operation (hour of day, weekday,
 * day/week/month boundaries, labels) must happen in the market's time zone, independent of
 * the viewer's browser time zone.
 *
 * Picked calendar days (date picker, URL params, presets) are represented as a `Date` at local
 * midnight whose local year/month/day *is* the market calendar day (the shape react-day-picker
 * produces). They are converted to market-time instants only at the filtering boundary.
 */

/** All supported markets (AT, DE-LU, FR) share the CET/CEST rules. */
export const MARKET_TIMEZONE = 'Europe/Vienna';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

// Per zone: UTC day index -> offset in minutes, or null when the offset changes during that day.
const offsetCache = new Map<string, Map<number, number | null>>();

/**
 * UTC offset (minutes) of the zone at the given instant. Cached per UTC day because
 * Intl-based lookups are too slow for tens of thousands of price rows.
 */
export const getMarketOffsetMinutes = (time: number, timeZone: string): number => {
  let zoneCache = offsetCache.get(timeZone);
  if (!zoneCache) {
    zoneCache = new Map();
    offsetCache.set(timeZone, zoneCache);
  }

  const dayIndex = Math.floor(time / DAY_MS);
  let offset = zoneCache.get(dayIndex);
  if (offset === undefined) {
    const dayStart = dayIndex * DAY_MS;
    const startOffset = tzOffset(timeZone, new Date(dayStart));
    const endOffset = tzOffset(timeZone, new Date(dayStart + DAY_MS - 1));
    offset = startOffset === endOffset ? startOffset : null;
    zoneCache.set(dayIndex, offset);
  }

  // DST transition days are resolved per instant.
  return offset ?? tzOffset(timeZone, new Date(time));
};

export interface MarketDateParts {
  year: number;
  /** 0-11 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
  /** 0-6, Sunday = 0 */
  weekday: number;
  /** Days since 1970-01-01 of the market calendar day; differences are calendar-day spans. */
  dayIndex: number;
  isoWeek: number;
  isoWeekYear: number;
}

const toTime = (value: number | string | Date): number =>
  typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : value.getTime();

export const getMarketDateParts = (value: number | string | Date, timeZone: string): MarketDateParts => {
  const time = toTime(value);
  // A Date shifted by the zone offset whose UTC fields are the market wall-clock fields.
  const wall = new Date(time + getMarketOffsetMinutes(time, timeZone) * MINUTE_MS);
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  const day = wall.getUTCDate();
  const weekday = wall.getUTCDay();
  const dayIndex = Math.floor(Date.UTC(year, month, day) / DAY_MS);

  // ISO week: the week belongs to the year of its Thursday.
  const thursdayIndex = dayIndex + 3 - ((weekday + 6) % 7);
  const isoWeekYear = new Date(thursdayIndex * DAY_MS).getUTCFullYear();
  const isoWeek = Math.floor((thursdayIndex - Date.UTC(isoWeekYear, 0, 1) / DAY_MS) / 7) + 1;

  return {
    year,
    month,
    day,
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
    weekday,
    dayIndex,
    isoWeek,
    isoWeekYear,
  };
};

const pad2 = (value: number) => String(value).padStart(2, '0');

/** `yyyy-MM-dd` of the market calendar day. */
export const getMarketDayKey = (parts: MarketDateParts): string =>
  `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;

/** `yyyy-MM-dd` of the Monday starting the market ISO week. */
export const getMarketWeekStartKey = (parts: MarketDateParts): string =>
  new Date((parts.dayIndex - ((parts.weekday + 6) % 7)) * DAY_MS).toISOString().slice(0, 10);

/**
 * Instant of the given market wall-clock time. On a spring-forward gap the result is shifted by
 * the gap; midnight is never affected in the supported markets.
 */
export const getMarketTime = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number => {
  const wall = Date.UTC(year, month, day, hour, minute);
  const guess = wall - getMarketOffsetMinutes(wall, timeZone) * MINUTE_MS;
  return wall - getMarketOffsetMinutes(guess, timeZone) * MINUTE_MS;
};

/** Local-midnight `Date` carrying the market calendar day of the instant (for pickers/presets). */
export const getMarketCalendarDay = (value: number | string | Date, timeZone: string): Date => {
  const { year, month, day } = getMarketDateParts(value, timeZone);
  return new Date(year, month, day);
};

/** First instant (market 00:00) of the calendar day carried by `day`'s local y/m/d. */
export const getMarketDayStart = (day: Date, timeZone: string): number =>
  getMarketTime(timeZone, day.getFullYear(), day.getMonth(), day.getDate());

/** Last millisecond (inclusive) of the calendar day carried by `day`'s local y/m/d in market time. */
export const getMarketDayEnd = (day: Date, timeZone: string): number =>
  getMarketTime(timeZone, day.getFullYear(), day.getMonth(), day.getDate() + 1) - 1;

/** date-fns `format` in the market time zone (German locale). For labels, not hot loops. */
export const formatMarketDate = (value: number | string | Date, pattern: string, timeZone: string): string =>
  format(toTime(value), pattern, { locale: de, in: tz(timeZone) });
