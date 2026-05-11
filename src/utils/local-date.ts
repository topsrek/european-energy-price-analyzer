import { format, startOfDay } from 'date-fns';

export const formatLocalDateForQuery = (date: Date): string =>
  format(startOfDay(date), 'yyyy-MM-dd');
