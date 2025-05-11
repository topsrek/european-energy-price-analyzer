
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ContractOption } from '@/types/energy-data';

interface ContractOptionsProps {
  annualConsumption: number;
  onAnnualConsumptionChange: (value: number) => void;
  contractOptions: ContractOption[];
}

const ContractOptions: React.FC<ContractOptionsProps> = ({
  annualConsumption,
  onAnnualConsumptionChange,
  contractOptions
}) => {
  const [consumption, setConsumption] = useState<string>(annualConsumption.toString());
  
  const handleUpdate = () => {
    const parsedValue = parseFloat(consumption);
    if (!isNaN(parsedValue) && parsedValue > 0) {
      onAnnualConsumptionChange(parsedValue);
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <Label htmlFor="annualConsumption" className="mb-2 block">
            Jahresverbrauch (kWh)
          </Label>
          <Input
            id="annualConsumption"
            type="number"
            min="0"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            placeholder="z.B. 3500"
          />
        </div>
        <Button onClick={handleUpdate}>Aktualisieren</Button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {contractOptions.map((option, index) => {
          const networkCosts = option.networkCosts(annualConsumption);
          const energyCosts = (option.energyPrice * annualConsumption) / 100;
          const totalCosts = option.basePrice + networkCosts + energyCosts;
          
          return (
            <Card key={index} className={index === 0 ? "border-energy-secondary" : ""}>
              {index === 0 && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-energy-secondary text-white px-3 py-1 rounded-full text-xs font-medium">
                  Günstigste Option
                </div>
              )}
              
              <CardHeader>
                <CardTitle>{option.name}</CardTitle>
                <CardDescription>Anbieter: {option.provider}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Grundpreis:</span>
                    <span className="font-medium">{option.basePrice.toFixed(2)} € / Jahr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Arbeitspreis:</span>
                    <span className="font-medium">{option.energyPrice.toFixed(2)} Cent / kWh</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Netzkosten:</span>
                    <span className="font-medium">{networkCosts.toFixed(2)} € / Jahr</span>
                  </div>
                  <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                    <span>Jahreskosten:</span>
                    <span>{totalCosts.toFixed(2)} €</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" className="w-full">
                  Details ansehen
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default ContractOptions;
