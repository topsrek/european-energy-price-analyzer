import React, { useMemo, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  getActiveQuickRangePreset,
  getQuickRangeDates,
  QUICK_RANGE_PRESETS,
  type QuickRangePresetId,
} from '@/utils/date-range-presets';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';
const DATE_INPUT_VALUE_FORMAT = 'yyyy-MM-dd';

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  minDate?: Date | null;
  maxDate?: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  minDate,
  maxDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);
  const isMobile = useIsMobile();
  const latestSelectableDate = useMemo(
    () => startOfDay(maxDate ?? new Date()),
    [maxDate]
  );
  const earliestSelectableDate = minDate ?? null;

  const activePreset = useMemo(
    () =>
      getActiveQuickRangePreset(startDate, endDate, latestSelectableDate, earliestSelectableDate),
    [startDate, endDate, latestSelectableDate, earliestSelectableDate]
  );

  const handleQuickSelect = (presetId: QuickRangePresetId) => {
    const range = getQuickRangeDates(presetId, latestSelectableDate, earliestSelectableDate);

    onStartDateChange(range.startDate);
    onEndDateChange(range.endDate);
  };

  useEffect(() => {
    // Close start date picker if end date picker is opened via start date selection
    if (isEndDatePickerOpen) {
      setIsStartDatePickerOpen(false);
    }
  }, [isEndDatePickerOpen]);

  const formatInputValue = (date: Date | null) =>
    date ? format(startOfDay(date), DATE_INPUT_VALUE_FORMAT) : '';

  const parseInputValue = (value: string): Date | null => {
    if (!value) {
      return null;
    }

    const [year, month, day] = value.split('-').map((part) => Number(part));
    if (!year || !month || !day) {
      return null;
    }

    return startOfDay(new Date(year, month - 1, day));
  };

  const mobileStartMaxDate = endDate && endDate < latestSelectableDate ? endDate : latestSelectableDate;
  const mobileEndMinDate =
    startDate && earliestSelectableDate && startDate < earliestSelectableDate
      ? earliestSelectableDate
      : startDate || earliestSelectableDate;

  const renderStartCalendar = () => (
    <Calendar
      mode="single"
      selected={startDate || undefined}
      onSelect={(date) => {
        if (!date && startDate) {
          setIsStartDatePickerOpen(false);
          setIsEndDatePickerOpen(true);
          return;
        }

        onStartDateChange(date);
        if (date) {
          setIsStartDatePickerOpen(false);
          setIsEndDatePickerOpen(true);
        }
      }}
      disabled={(date) =>
        date > latestSelectableDate ||
        (earliestSelectableDate ? date < earliestSelectableDate : false) ||
        (endDate ? date > endDate : false)
      }
      initialFocus
      defaultMonth={startDate || endDate || latestSelectableDate}
      numberOfMonths={isMobile ? 1 : 2}
      className={cn("p-3 pointer-events-auto")}
    />
  );

  const renderEndCalendar = () => (
    <Calendar
      mode="single"
      selected={endDate || undefined}
      onSelect={(date) => {
        if (!date && endDate) {
          setIsEndDatePickerOpen(false);
          return;
        }

        onEndDateChange(date);
        if (date) {
          setIsEndDatePickerOpen(false);
        }
      }}
      disabled={(date) =>
        date > latestSelectableDate ||
        (earliestSelectableDate ? date < earliestSelectableDate : false) ||
        (startDate ? date < startDate : false)
      }
      initialFocus
      defaultMonth={endDate || startDate || latestSelectableDate}
      numberOfMonths={isMobile ? 1 : 2}
      className={cn("p-3 pointer-events-auto")}
    />
  );

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex w-full min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap xl:w-auto">
        {isMobile ? (
          <div className="grid w-full gap-3 rounded-lg border border-border/80 bg-card p-3 shadow-sm min-[420px]:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Von</span>
              <div className="relative">
                <Input
                  type="date"
                  value={formatInputValue(startDate)}
                  min={earliestSelectableDate ? formatInputValue(earliestSelectableDate) : undefined}
                  max={formatInputValue(mobileStartMaxDate)}
                  onChange={(event) => onStartDateChange(parseInputValue(event.target.value))}
                  className="h-11 border-border/80 pr-10 text-base font-medium [color-scheme:light] dark:[color-scheme:dark]"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">
                {startDate ? format(startDate, 'PPP', { locale: de }) : 'Startdatum wählen'}
              </span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Bis</span>
              <div className="relative">
                <Input
                  type="date"
                  value={formatInputValue(endDate)}
                  min={mobileEndMinDate ? formatInputValue(mobileEndMinDate) : undefined}
                  max={formatInputValue(latestSelectableDate)}
                  onChange={(event) => onEndDateChange(parseInputValue(event.target.value))}
                  className="h-11 border-border/80 pr-10 text-base font-medium [color-scheme:light] dark:[color-scheme:dark]"
                />
                <CalendarIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground">
                {endDate ? format(endDate, 'PPP', { locale: de }) : 'Enddatum wählen'}
              </span>
            </label>
          </div>
        ) : (
          <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal min-[420px]:w-[180px]",
                  !startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, 'PPP', { locale: de }) : <span>Von</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {renderStartCalendar()}
            </PopoverContent>
          </Popover>
        )}
        {!isMobile && (
          <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal min-[420px]:w-[180px]",
                  !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, 'PPP', { locale: de }) : <span>Bis</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {renderEndCalendar()}
            </PopoverContent>
          </Popover>
        )}
      </div>
      
      <div className={cn(
        "flex w-full min-w-0 items-center gap-2 xl:w-auto",
        isMobile ? "overflow-x-auto pb-1" : "flex-wrap"
      )}>
        {QUICK_RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant="outline"
            size="sm"
            className={cn(
              "shrink-0",
              activePreset === preset.id && SELECTED_OPTION_BUTTON_CLASS
            )}
            aria-pressed={activePreset === preset.id}
            onClick={() => handleQuickSelect(preset.id)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default DateRangePicker;
