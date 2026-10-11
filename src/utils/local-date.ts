import { format, startOfDay } from 'date-fns';

// URL start/end params are market calendar days. They round-trip through local-midnight Dates
// whose local y/m/d is that day (see utils/market-time); the viewer's time zone never shifts them.

export const formatLocalDateForQuery = (date: Date): string =>
  format(startOfDay(date), 'yyyy-MM-dd');

export const parseLocalDateFromQuery = (value: string | null): Date | null => {
  if (!value) return null;

  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Reject dates that JS silently rolls over (e.g. 2026-02-31 -> 2026-03-03).
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return startOfDay(date);
};
