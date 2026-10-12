import React, { lazy, Suspense, useMemo, useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import type { DateRange } from 'react-day-picker';
import { getMarketCalendarDay } from '@/utils/market-time';
import { setRangeEndpoint, type RangeEndpoint } from '@/utils/date-range';

// The calendar (react-day-picker) and the mobile drawer (vaul) load when first needed.
const Calendar = lazy(() => import('@/components/ui/calendar').then((module) => ({ default: module.Calendar })));
const DateRangeDrawer = lazy(() => import('@/components/DateRangeDrawer'));
const PREFETCH_CALENDAR_DELAY_MS = 2000;

const SELECTED_OPTION_BUTTON_CLASS =
  'border-accent bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground';
const MOBILE_VISIBLE_PRESET_IDS: QuickRangePresetId[] = ['1d', '3d', '1m'];
const MOBILE_MENU_PRESET_IDS: QuickRangePresetId[] = ['1w', '3m', '6m', '1y', '5y'];
// All dates are calendar days: local-midnight Dates whose y/m/d is the market calendar day.
interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  minDate?: Date | null;
  maxDate?: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
  /** Market time zone, used for "today" when no data bounds are known yet. */
  timeZone: string;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  minDate,
  maxDate,
  onStartDateChange,
  onEndDateChange,
  timeZone,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isMoreRangesOpen, setIsMoreRangesOpen] = useState(false);
  const [activeEndpoint, setActiveEndpoint] = useState<RangeEndpoint>('to');
  const isMobile = useIsMobile();

  // Fetch the calendar chunk once the page has settled, so opening the picker is instant.
  useEffect(() => {
    const timer = window.setTimeout(() => void import('@/components/ui/calendar'), PREFETCH_CALENDAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const latestSelectableDate = useMemo(
    () => startOfDay(maxDate ?? getMarketCalendarDay(Date.now(), timeZone)),
    [maxDate, timeZone]
  );
  const earliestSelectableDate = useMemo(
    () => (minDate ? startOfDay(minDate) : null),
    [minDate]
  );
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

  const handlePickerOpenChange = (open: boolean) => {
    setIsPickerOpen(open);
    if (open) {
      setDraftRange({ from: startDate ?? undefined, to: endDate ?? undefined });
      setActiveEndpoint(startDate ? 'to' : 'from');
    }
  };

  const handleDayClick = (date: Date) => {
    const range = setRangeEndpoint(draftRange, activeEndpoint, date);
    setDraftRange(range);
    onStartDateChange(range.from ?? null);
    onEndDateChange(range.to ?? null);

    if (activeEndpoint === 'from') {
      setActiveEndpoint('to');
    } else {
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
    <div>
      <div className="grid grid-cols-2 gap-2 border-b p-3">
        {(['from', 'to'] as const).map((endpoint) => {
          const date = endpoint === 'from' ? draftRange?.from : draftRange?.to;
          const active = activeEndpoint === endpoint;
          return (
            <button
              key={endpoint}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveEndpoint(endpoint)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-accent" : "border-border hover:bg-muted",
              )}
            >
              <span className="block text-xs text-muted-foreground">
                {endpoint === 'from' ? 'Von' : 'Bis'}
              </span>
              <span className="block text-sm font-medium">
                {date ? format(date, 'dd.MM.yyyy', { locale: de }) : 'Datum'}
              </span>
            </button>
          );
        })}
      </div>
      <Suspense fallback={<div className={cn("p-3", isMobile ? "h-[330px] w-[280px]" : "h-[330px] w-[560px]")} aria-busy="true" />}>
        <Calendar
          mode="range"
          locale={de}
          weekStartsOn={1}
          selected={draftRange}
          onDayClick={handleDayClick}
          disabled={(date) =>
            date > latestSelectableDate ||
            (earliestSelectableDate ? date < earliestSelectableDate : false) ||
            (activeEndpoint === 'to' && draftRange?.from ? date < draftRange.from : false)
          }
          initialFocus
          defaultMonth={draftRange?.to || endDate || draftRange?.from || startDate || latestSelectableDate}
          numberOfMonths={isMobile ? 1 : 2}
          className="pointer-events-auto"
        />
      </Suspense>
    </div>
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
            <Suspense
              fallback={
                // Same trigger until the drawer chunk is there; a tap opens it once loaded.
                <div onClick={() => handlePickerOpenChange(true)}>{renderPickerTrigger(true)}</div>
              }
            >
              <DateRangeDrawer
                open={isPickerOpen}
                onOpenChange={handlePickerOpenChange}
                trigger={renderPickerTrigger(true)}
              >
                {renderRangeCalendar()}
              </DateRangeDrawer>
            </Suspense>

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
            <Popover open={isPickerOpen} onOpenChange={handlePickerOpenChange}>
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
