
import React from 'react';
import { AveragingOption } from '@/types/energy-data';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AveragingOptionsProps {
  selectedOption: AveragingOption;
  onChange: (option: AveragingOption) => void;
}

const AveragingOptions: React.FC<AveragingOptionsProps> = ({ selectedOption, onChange }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="averaging" className="text-sm font-medium">Durchschnittswerte berechnen</Label>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-gray-400" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              <p>Berechnet Durchschnittswerte für den ausgewählten Zeitraum pro Stunde, Tag oder Monat</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Select value={selectedOption} onValueChange={(value) => onChange(value as AveragingOption)}>
        <SelectTrigger id="averaging">
          <SelectValue placeholder="Durchschnitt auswählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Keine Durchschnittsberechnung</SelectItem>
          <SelectItem value="hourly">Stündlicher Durchschnitt</SelectItem>
          <SelectItem value="daily">Täglicher Durchschnitt</SelectItem>
          <SelectItem value="monthly">Monatlicher Durchschnitt</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default AveragingOptions;
