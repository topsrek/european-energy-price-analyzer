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
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import type { DateRange } from 'react-day-picker';

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const isMobile = useIsMobile();
  const latestSelectableDate = useMemo(
    () => startOfDay(maxDate ?? new Date()),
    [maxDate]
  );
  const earliestSelectableDate = minDate ?? null;
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => ({
    from: startDate ?? undefined,
    to: endDate ?? undefined,
  }));

  const activePreset = useMemo(
    () =>
      getActiveQuickRangePreset(startDate, endDate, latestSelectableDate, earliestSelectableDate),
    [startDate, endDate, latestSelectableDate, earliestSelectableDate]
  );

  const handleQuickSelect = (presetId: QuickRangePresetId) => {
    const range = getQuickRangeDates(presetId, latestSelectableDate, earliestSelectableDate);

    setDraftRange({
      from: range.startDate,
      to: range.endDate,
    });
    onStartDateChange(range.startDate);
    onEndDateChange(range.endDate);
    setIsPickerOpen(false);
  };

  useEffect(() => {
    if (!isPickerOpen) {
      setDraftRange({
        from: startDate ?? undefined,
        to: endDate ?? undefined,
      });
    }
  }, [endDate, isPickerOpen, startDate]);

  const handleRangeSelect = (range: DateRange | undefined) => {
    setDraftRange(range);

    if (!range?.from) {
      onStartDateChange(null);
      onEndDateChange(null);
      return;
    }

    if (range.to) {
      onStartDateChange(startOfDay(range.from));
      onEndDateChange(startOfDay(range.to));
      setIsPickerOpen(false);
    }
  };

  const formatRangeLabel = () => {
    if (!startDate && !endDate) {
      return 'Zeitraum wählen';
    }

    if (startDate && endDate) {
      if (format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
        return format(startDate, 'PPP', { locale: de });
      }

      return `${format(startDate, 'P', { locale: de })} - ${format(endDate, 'P', { locale: de })}`;
    }

    return format(startDate ?? endDate ?? latestSelectableDate, 'PPP', { locale: de });
  };

  const renderRangeCalendar = () => (
    <Calendar
      mode="range"
      selected={draftRange}
      onSelect={handleRangeSelect}
      disabled={(date) =>
        date > latestSelectableDate ||
        (earliestSelectableDate ? date < earliestSelectableDate : false)
      }
      initialFocus
      defaultMonth={draftRange?.from || startDate || endDate || latestSelectableDate}
      numberOfMonths={isMobile ? 1 : 2}
      className={cn("pointer-events-auto")}
    />
  );

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex w-full min-w-0 xl:w-auto">
        {isMobile ? (
          <Drawer open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <DrawerTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 w-full justify-start text-left font-normal",
                  !startDate && !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatRangeLabel()}
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Zeitraum wählen</DrawerTitle>
              </DrawerHeader>
              <div className="mx-auto pb-4">
                {renderRangeCalendar()}
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-11 w-full justify-start text-left font-normal xl:min-w-[280px]",
                  !startDate && !endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatRangeLabel()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              {renderRangeCalendar()}
            </PopoverContent>
          </Popover>
        )}
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
