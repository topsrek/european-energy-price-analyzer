
import React from 'react';
import { AveragingOption } from '@/types/energy-data';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';

interface AveragingOptionsProps {
  selectedOption: AveragingOption;
  onChange: (option: AveragingOption) => void;
  isAveragingEnabled: boolean;
  onAveragingToggle: (enabled: boolean) => void;
}

const AveragingOptions: React.FC<AveragingOptionsProps> = ({ 
  selectedOption, 
  onChange, 
  isAveragingEnabled, 
  onAveragingToggle 
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch 
          id="enable-averaging"
          checked={isAveragingEnabled}
          onCheckedChange={onAveragingToggle}
        />
        <Label htmlFor="enable-averaging" className="text-sm font-medium">Durchschnitt berechnen</Label>
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

      <Select 
        value={selectedOption} 
        onValueChange={(value) => onChange(value as AveragingOption)}
        disabled={!isAveragingEnabled}
      >
        <SelectTrigger id="averaging">
          <SelectValue placeholder="Durchschnitt auswählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hourly">Stündlicher Durchschnitt</SelectItem>
          <SelectItem value="daily">Täglicher Durchschnitt</SelectItem>
          <SelectItem value="monthly">Monatlicher Durchschnitt</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default AveragingOptions;
