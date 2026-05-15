import { isSameDay, startOfDay, subDays, subMonths, subYears } from 'date-fns';

export type QuickRangePresetId = '1d' | '3d' | '1w' | '1m' | '3m' | '1y' | '5y';

interface QuickRangePresetDefinition {
  id: QuickRangePresetId;
  label: string;
  getStartDate: (endDate: Date) => Date;
}

export const QUICK_RANGE_PRESETS: QuickRangePresetDefinition[] = [
  { id: '1d', label: '1 Tag', getStartDate: (endDate) => endDate },
  { id: '3d', label: '3 Tage', getStartDate: (endDate) => subDays(endDate, 2) },
  { id: '1w', label: '1 Woche', getStartDate: (endDate) => subDays(endDate, 7) },
  { id: '1m', label: '1 Monat', getStartDate: (endDate) => subMonths(endDate, 1) },
  { id: '3m', label: '3 Monate', getStartDate: (endDate) => subMonths(endDate, 3) },
  { id: '1y', label: '1 Jahr', getStartDate: (endDate) => subYears(endDate, 1) },
  { id: '5y', label: '5 Jahre', getStartDate: (endDate) => subYears(endDate, 5) },
];

export const getQuickRangeDates = (
  presetId: QuickRangePresetId,
  endDate: Date,
  minDate?: Date | null
) => {
  const preset = QUICK_RANGE_PRESETS.find((candidate) => candidate.id === presetId);

  if (!preset) {
    throw new Error(`Unknown quick range preset: ${presetId}`);
  }

  const rawStartDate = startOfDay(preset.getStartDate(endDate));
  const earliestAllowedDate = minDate ? startOfDay(minDate) : null;
  const startDate =
    earliestAllowedDate && rawStartDate < earliestAllowedDate
      ? earliestAllowedDate
      : rawStartDate;

  return {
    startDate,
    endDate,
  };
};

export const getActiveQuickRangePreset = (
  startDate: Date | null,
  endDate: Date | null,
  maxDate: Date | null,
  minDate?: Date | null
): QuickRangePresetId | null => {
  if (!startDate || !endDate || !maxDate) {
    return null;
  }

  if (!isSameDay(endDate, maxDate)) {
    return null;
  }

  for (const preset of QUICK_RANGE_PRESETS) {
    const range = getQuickRangeDates(preset.id, maxDate, minDate);
    if (isSameDay(startDate, range.startDate) && isSameDay(endDate, range.endDate)) {
      return preset.id;
    }
  }

  return null;
};
