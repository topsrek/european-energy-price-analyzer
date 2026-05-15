import { format, startOfDay } from 'date-fns';

export const formatLocalDateForQuery = (date: Date): string =>
  format(startOfDay(date), 'yyyy-MM-dd');

export const parseLocalDateFromQuery = (value: string | null): Date | null => {
  if (!value) return null;

  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;

  return startOfDay(new Date(year, month - 1, day));
};
