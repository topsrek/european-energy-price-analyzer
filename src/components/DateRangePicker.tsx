import React, { useMemo, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronDown } from 'lucide-react';
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
const MOBILE_VISIBLE_PRESET_IDS: QuickRangePresetId[] = ['1d', '3d', '1m'];
const MOBILE_MENU_PRESET_IDS: QuickRangePresetId[] = ['1w', '3m', '6m', '1y', '5y'];

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
  const [isMoreRangesOpen, setIsMoreRangesOpen] = useState(false);
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
  const visibleMobilePresets = useMemo(
    () => QUICK_RANGE_PRESETS.filter((preset) => MOBILE_VISIBLE_PRESET_IDS.includes(preset.id)),
    []
  );
  const hiddenMobilePresets = useMemo(
    () => QUICK_RANGE_PRESETS.filter((preset) => MOBILE_MENU_PRESET_IDS.includes(preset.id)),
    []
  );
  const isHiddenMobilePresetActive =
    activePreset !== null && MOBILE_MENU_PRESET_IDS.includes(activePreset);

  const handleQuickSelect = (presetId: QuickRangePresetId) => {
    const range = getQuickRangeDates(presetId, latestSelectableDate, earliestSelectableDate);

    setDraftRange({
      from: range.startDate,
      to: range.endDate,
    });
    onStartDateChange(range.startDate);
    onEndDateChange(range.endDate);
    setIsPickerOpen(false);
    setIsMoreRangesOpen(false);
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

  const formatRangeLabel = (compact = false) => {
    if (!startDate && !endDate) {
      return 'Zeitraum wählen';
    }

    if (startDate && endDate) {
      if (format(startDate, 'yyyy-MM-dd') === format(endDate, 'yyyy-MM-dd')) {
        return format(startDate, compact ? 'dd.MM.yy' : 'PPP', { locale: de });
      }

      if (compact) {
        return `${format(startDate, 'dd.MM.yy', { locale: de })} - ${format(endDate, 'dd.MM.yy', { locale: de })}`;
      }

      return `${format(startDate, 'P', { locale: de })} - ${format(endDate, 'P', { locale: de })}`;
    }

    return format(startDate ?? endDate ?? latestSelectableDate, compact ? 'dd.MM.yy' : 'PPP', { locale: de });
  };

  const renderRangeCalendar = () => (
    <Calendar
      mode="range"
      locale={de}
      weekStartsOn={1}
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

  const renderPickerTrigger = (compactLabel = false, className?: string) => (
    <Button
      variant="outline"
      className={cn(
        "h-11 w-full justify-start text-left font-normal",
        !startDate && !endDate && "text-muted-foreground",
        className
      )}
    >
      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
      <span className="truncate">{formatRangeLabel(compactLabel)}</span>
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      {isMobile ? (
        <div className="flex w-full flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Drawer open={isPickerOpen} onOpenChange={setIsPickerOpen}>
              <DrawerTrigger asChild>
                {renderPickerTrigger(true)}
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

            <Popover open={isMoreRangesOpen} onOpenChange={setIsMoreRangesOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "h-11 justify-between px-3 text-left font-normal",
                    isHiddenMobilePresetActive && SELECTED_OPTION_BUTTON_CLASS
                  )}
                >
                  <span>Mehr Zeiträume</span>
                  <ChevronDown className="h-4 w-4 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <div className="grid gap-2">
                  {hiddenMobilePresets.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "justify-start",
                        activePreset === preset.id && SELECTED_OPTION_BUTTON_CLASS
                      )}
                      aria-pressed={activePreset === preset.id}
                      onClick={() => handleQuickSelect(preset.id)}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {visibleMobilePresets.map((preset) => (
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
      ) : (
        <>
          <div className="flex w-full min-w-0 xl:w-auto">
            <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
              <PopoverTrigger asChild>
                {renderPickerTrigger(false, "xl:min-w-[280px]")}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                {renderRangeCalendar()}
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
        </>
      )}
    </div>
  );
};

export default DateRangePicker;
