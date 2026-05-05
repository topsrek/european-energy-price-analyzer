import React, { useMemo, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  getActiveQuickRangePreset,
  getQuickRangeDates,
  QUICK_RANGE_PRESETS,
  type QuickRangePresetId,
} from '@/utils/date-range-presets';

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';

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
  const latestSelectableDate = useMemo(() => maxDate ?? new Date(), [maxDate]);
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

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex w-full min-w-0 flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap xl:w-auto">
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
            <Calendar
              mode="single"
              selected={startDate || undefined}
              onSelect={(date) => {
                // If date is undefined, it means clicking on already selected date - keep it selected and close
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
              defaultMonth={startDate || latestSelectableDate}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

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
            <Calendar
              mode="single"
              selected={endDate || undefined}
              onSelect={(date) => {
                // If date is undefined, it means clicking on already selected date - keep it selected and close
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
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto">
        {QUICK_RANGE_PRESETS.map((preset) => (
          <Button
            key={preset.id}
            variant="outline"
            size="sm"
            className={cn(activePreset === preset.id && SELECTED_OPTION_BUTTON_CLASS)}
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
