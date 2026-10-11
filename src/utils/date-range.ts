import { isAfter, startOfDay } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export type RangeEndpoint = 'from' | 'to';

export const setRangeEndpoint = (
  range: DateRange | undefined,
  endpoint: RangeEndpoint,
  date: Date,
): DateRange => {
  const day = startOfDay(date);

  if (endpoint === 'from') {
    const to = range?.to && !isAfter(day, range.to) ? range.to : day;
    return { from: day, to };
  }

  const from = range?.from && !isAfter(range.from, day) ? range.from : day;
  return { from, to: day };
};

