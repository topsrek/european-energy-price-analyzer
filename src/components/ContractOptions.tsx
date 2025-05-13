
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
  onSelectContract: (contract: ContractOption | undefined) => void;
  selectedContract?: ContractOption;
}

const ContractOptions: React.FC<ContractOptionsProps> = ({
  annualConsumption,
  onAnnualConsumptionChange,
  contractOptions,
  onSelectContract,
  selectedContract
}) => {
  const [consumption, setConsumption] = useState<string>(annualConsumption.toString());
  
  const handleUpdate = () => {
    const parsedValue = parseFloat(consumption);
    if (!isNaN(parsedValue) && parsedValue > 0) {
      onAnnualConsumptionChange(parsedValue);
    }
  };

  // Calculate costs for each contract option
  const prepareContractData = () => {
    return contractOptions.map((option) => {
      const networkCosts = option.networkCosts(annualConsumption);
      const energyCosts = (option.energyPrice * annualConsumption) / 100;
      const basePrice = option.basePrice;
      const totalFixedCosts = networkCosts + basePrice;
      const tax = (energyCosts + totalFixedCosts) * 0.2; // 20% VAT

      return {
        name: option.name,
        provider: option.provider,
        energyCosts: parseFloat(energyCosts.toFixed(2)),
        fixedCosts: parseFloat(totalFixedCosts.toFixed(2)),
        networkCosts: parseFloat(networkCosts.toFixed(2)),
        basePrice: parseFloat(basePrice.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat((energyCosts + totalFixedCosts + tax).toFixed(2)),
      };
    });
  };

  const contractData = prepareContractData();

  const handleSelectContract = (contract: ContractOption) => {
    if (selectedContract?.name === contract.name) {
      onSelectContract(undefined); // Deselect if already selected
    } else {
      onSelectContract(contract); // Select new contract
    }
  };
  
  return (
    <div className="space-y-6">
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
        {contractData.map((contract, index) => {
          const isSelected = selectedContract?.name === contractOptions[index].name;
          return (
            <Card 
              key={index} 
              className={isSelected ? "ring-2 ring-primary" : ""}
            >
              <CardHeader>
                <CardTitle>{contract.name}</CardTitle>
                <CardDescription>Anbieter: {contract.provider}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Arbeitspreis */}
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Arbeitspreis:</div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Energiekosten</span>
                      <span>{contractOptions[index].energyPrice.toFixed(2)} Cent / kWh</span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Jahreskosten Energie</span>
                      <span>{contract.energyCosts.toFixed(2)} € / Jahr</span>
                    </div>
                  </div>
                  
                  {/* Fixkosten */}
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Fixkosten:</div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Grundpreis</span>
                      <span>{contract.basePrice.toFixed(2)} € / Jahr</span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Netzkosten</span>
                      <span>{contract.networkCosts.toFixed(2)} € / Jahr</span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm font-medium">
                      <span>Fixkosten gesamt</span>
                      <span>{contract.fixedCosts.toFixed(2)} € / Jahr</span>
                    </div>
                  </div>

                  {/* Steuern */}
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Steuern:</div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Umsatzsteuer (20%)</span>
                      <span>{contract.tax.toFixed(2)} € / Jahr</span>
                    </div>
                  </div>

                  <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                    <span>Jahreskosten:</span>
                    <span>{contract.total.toFixed(2)} €</span>
                  </div>
                  <div className="text-xs text-gray-500 text-center">
                    Jahresverbrauch: {annualConsumption} kWh
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  variant={isSelected ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleSelectContract(contractOptions[index])}
                >
                  {isSelected ? "Ausgewählt" : "In Grafik anzeigen"}
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
