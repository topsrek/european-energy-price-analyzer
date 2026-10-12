
import React, { useEffect, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface ConsumptionSliderProps {
  value: number;
  onChange: (value: number) => void;
}

// Per-kWh prices spread yearly fees over the consumption, so it must stay above zero.
const MIN_ANNUAL_CONSUMPTION = 100;
const MAX_ANNUAL_CONSUMPTION = 10000;

const ConsumptionSlider: React.FC<ConsumptionSliderProps> = ({ value, onChange }) => {
  // Keep the typed text so intermediate values (e.g. "5" on the way to "500") are not rejected.
  const [inputText, setInputText] = useState(String(value));

  useEffect(() => {
    setInputText(String(value));
  }, [value]);

  const handleSliderChange = (values: number[]) => {
    onChange(values[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    const newValue = Number.parseInt(e.target.value, 10);
    if (newValue >= MIN_ANNUAL_CONSUMPTION && newValue <= MAX_ANNUAL_CONSUMPTION) {
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
          min={MIN_ANNUAL_CONSUMPTION}
          max={MAX_ANNUAL_CONSUMPTION}
          step={100}
          value={[value]}
          onValueChange={handleSliderChange}
          className="flex-1"
        />
        <Input
          type="number"
          min={MIN_ANNUAL_CONSUMPTION}
          max={MAX_ANNUAL_CONSUMPTION}
          value={inputText}
          onChange={handleInputChange}
          onBlur={() => setInputText(String(value))}
          aria-label="Jahresverbrauch in kWh"
          className="w-24"
        />
      </div>
    </div>
  );
};

export default ConsumptionSlider;
