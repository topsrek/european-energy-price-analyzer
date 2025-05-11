
import React from 'react';
import { Button } from "@/components/ui/button";
import { AveragingOption } from '@/types/energy-data';

interface AveragingOptionsProps {
  selectedOption: AveragingOption;
  onChange: (option: AveragingOption) => void;
}

const AveragingOptions: React.FC<AveragingOptionsProps> = ({ selectedOption, onChange }) => {
  const options: { value: AveragingOption; label: string }[] = [
    { value: 'none', label: 'Keine Mittelung' },
    { value: 'hourly', label: 'Stündlich' },
    { value: 'daily', label: 'Täglich' },
    { value: 'monthly', label: 'Monatlich' },
  ];
  
  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium mb-2">Mittelungszeitraum:</h3>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={selectedOption === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
};

export default AveragingOptions;
