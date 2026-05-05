import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FilterOptions, AveragingOption } from '@/types/energy-data';
import { FilterIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FilterOptionsProps {
  filters: FilterOptions;
  onChange: (filters: FilterOptions) => void;
  disabled?: boolean;
  averagingOption?: AveragingOption;
}

const FilterOptionsComponent: React.FC<FilterOptionsProps> = ({ 
  filters, 
  onChange, 
  disabled = false, 
  averagingOption 
}) => {
  const [isMonthsOpen, setIsMonthsOpen] = useState(false);
  const [isWeekdaysOpen, setIsWeekdaysOpen] = useState(false);
  const [isHoursOpen, setIsHoursOpen] = useState(false);
  
  const monthNames = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];
  
  // Rearranged to have Monday as the first day (index 1) of the week
  const weekdayNames = [
    'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'
  ];
  
  // Convert between our display order (Mon-Sun) and JavaScript's day indices (Sun-Sat)
  const displayToJsDay = (displayIndex) => (displayIndex + 1) % 7;
  const jsDayToDisplay = (jsDay) => (jsDay + 6) % 7;
  
  const toggleMonth = (month: number) => {
    const updatedMonths = filters.months.includes(month)
      ? filters.months.filter(m => m !== month)
      : [...filters.months, month];
    
    onChange({
      ...filters,
      months: updatedMonths
    });
  };
  
  const toggleWeekday = (displayDayIndex: number) => {
    // Convert to JavaScript day index
    const jsDay = displayToJsDay(displayDayIndex);
    
    const updatedWeekdays = filters.weekdays.includes(jsDay)
      ? filters.weekdays.filter(w => w !== jsDay)
      : [...filters.weekdays, jsDay];
    
    onChange({
      ...filters,
      weekdays: updatedWeekdays
    });
  };
  
  const toggleHour = (hour: number) => {
    const updatedHours = filters.hours.includes(hour)
      ? filters.hours.filter(h => h !== hour)
      : [...filters.hours, hour];
    
    onChange({
      ...filters,
      hours: updatedHours
    });
  };
  
  const selectAllMonths = () => {
    onChange({
      ...filters,
      months: Array.from({ length: 12 }, (_, i) => i)
    });
  };
  
  const selectAllWeekdays = () => {
    onChange({
      ...filters,
      weekdays: Array.from({ length: 7 }, (_, i) => i)
    });
  };
  
  const selectAllHours = () => {
    onChange({
      ...filters,
      hours: Array.from({ length: 24 }, (_, i) => i)
    });
  };
  
  const getFilterCounts = () => {
    return {
      months: 12 - filters.months.length,
      weekdays: 7 - filters.weekdays.length,
      hours: 24 - filters.hours.length,
    };
  };

  // Determine which filters should be disabled based on the averaging option
  const isMonthsDisabled = disabled || (averagingOption === 'monthly');
  const isWeekdaysDisabled = disabled || (averagingOption === 'daily');
  const isHoursDisabled = disabled || (averagingOption === 'daily-cycle');
  
  const filterCounts = getFilterCounts();
  const hasActiveFilters = filterCounts.months > 0 || filterCounts.weekdays > 0 || filterCounts.hours > 0;
  
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <h3 className="text-sm font-medium">Datenfilter:</h3>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Popover open={isMonthsOpen && !isMonthsDisabled} onOpenChange={(open) => !isMonthsDisabled && setIsMonthsOpen(open)}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2" disabled={isMonthsDisabled}>
                Monate
                {!isMonthsDisabled && filterCounts.months > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center">
                    {12 - filterCounts.months}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Monate</h4>
                  <Button variant="ghost" size="sm" onClick={selectAllMonths}>
                    Alle
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {monthNames.map((month, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`month-${i}`} 
                        checked={filters.months.includes(i)} 
                        onCheckedChange={() => toggleMonth(i)} 
                      />
                      <Label htmlFor={`month-${i}`} className="text-sm">{month}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover open={isWeekdaysOpen && !isWeekdaysDisabled} onOpenChange={(open) => !isWeekdaysDisabled && setIsWeekdaysOpen(open)}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2" disabled={isWeekdaysDisabled}>
                Wochentage
                {!isWeekdaysDisabled && filterCounts.weekdays > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center">
                    {7 - filterCounts.weekdays}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Wochentage</h4>
                  <Button variant="ghost" size="sm" onClick={selectAllWeekdays}>
                    Alle
                  </Button>
                </div>
                <div className="space-y-2">
                  {weekdayNames.map((day, displayIndex) => {
                    const jsDay = displayToJsDay(displayIndex);
                    return (
                      <div key={displayIndex} className="flex items-center space-x-2">
                        <Checkbox 
                          id={`day-${displayIndex}`} 
                          checked={filters.weekdays.includes(jsDay)}
                          onCheckedChange={() => toggleWeekday(displayIndex)}
                        />
                        <Label htmlFor={`day-${displayIndex}`} className="text-sm">{day}</Label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Popover open={isHoursOpen && !isHoursDisabled} onOpenChange={(open) => !isHoursDisabled && setIsHoursOpen(open)}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2" disabled={isHoursDisabled}>
                Stunden
                {!isHoursDisabled && filterCounts.hours > 0 && (
                  <Badge variant="secondary" className="h-5 min-w-5 flex items-center justify-center">
                    {24 - filterCounts.hours}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Stunden</h4>
                  <Button variant="ghost" size="sm" onClick={selectAllHours}>
                    Alle
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`hour-${i}`}
                        checked={filters.hours.includes(i)}
                        onCheckedChange={() => toggleHour(i)}
                      />
                      <Label htmlFor={`hour-${i}`} className="text-xs whitespace-nowrap">{`${i}:00~${(i+1) % 24}:00`}</Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          {hasActiveFilters && !disabled && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => onChange({
                months: Array.from({ length: 12 }, (_, i) => i),
                weekdays: Array.from({ length: 7 }, (_, i) => i),
                hours: Array.from({ length: 24 }, (_, i) => i),
              })}
              className="text-destructive"
            >
              Filter zurücksetzen
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilterOptionsComponent;
