import React, { useState, useEffect } from 'react';
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

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onStartDateChange: (date: Date | null) => void;
  onEndDateChange: (date: Date | null) => void;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const handleQuickSelect = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    
    onStartDateChange(start);
    onEndDateChange(end);
  };

  useEffect(() => {
    // Close start date picker if end date picker is opened via start date selection
    if (isEndDatePickerOpen) {
      setIsStartDatePickerOpen(false);
    }
  }, [isEndDatePickerOpen]);

  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6 items-start sm:items-center">
      <div className="flex flex-col flex-wrap sm:flex-row gap-2">
        <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal",
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
                onStartDateChange(date);
                if (date) {
                  setIsStartDatePickerOpen(false);
                  setIsEndDatePickerOpen(true);
                }
              }}
              disabled={(date) => date > new Date() || (endDate ? date > endDate : false)}
              initialFocus
              month={startDate || undefined}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[180px] justify-start text-left font-normal",
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
                onEndDateChange(date);
                if (date) {
                  setIsEndDatePickerOpen(false);
                }
              }}
              disabled={(date) => date > new Date() || (startDate ? date < startDate : false)}
              initialFocus
              month={endDate || startDate || undefined}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>
      
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => handleQuickSelect(7)}>1 Woche</Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickSelect(30)}>1 Monat</Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickSelect(90)}>3 Monate</Button>
        <Button variant="outline" size="sm" onClick={() => handleQuickSelect(365)}>1 Jahr</Button>
      </div>
    </div>
  );
};

export default DateRangePicker;
