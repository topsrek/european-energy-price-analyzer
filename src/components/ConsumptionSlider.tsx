
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ConsumptionSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const ConsumptionSlider: React.FC<ConsumptionSliderProps> = ({ value, onChange }) => {
  const handleSliderChange = (values: number[]) => {
    onChange(values[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || 0;
    if (newValue >= 0 && newValue <= 10000) {
      onChange(newValue);
    }
  };

  return (
    <div className="space-y-4">
      <Label htmlFor="consumption-slider" className="text-sm font-medium">
        Jahresverbrauch: {value} kWh
      </Label>
      <div className="flex items-center gap-4">
        <Slider
          id="consumption-slider"
          min={0}
          max={10000}
          step={100}
          value={[value]}
          onValueChange={handleSliderChange}
          className="flex-1"
        />
        <Input
          type="number"
          min="0"
          max="10000"
          value={value}
          onChange={handleInputChange}
          className="w-24"
        />
      </div>
    </div>
  );
};

export default ConsumptionSlider;
