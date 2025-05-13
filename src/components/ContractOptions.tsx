
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ContractOption } from '@/types/energy-data';
import datesConfig from '@/config/dates.json';
import { cn } from '@/lib/utils';

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
  const [editableEcoTariff, setEditableEcoTariff] = useState({
    provider: contractOptions[1]?.provider || "Grüne Energie GmbH",
    basePrice: contractOptions[1]?.basePrice || 84,
    energyPrice: contractOptions[1]?.energyPrice || 7.10
  });
  
  const handleUpdate = () => {
    const parsedValue = parseFloat(consumption);
    if (!isNaN(parsedValue) && parsedValue > 0) {
      onAnnualConsumptionChange(parsedValue);
    }
  };

  useEffect(() => {
    const updatedOptions = [...contractOptions];
    // Update eco tariff with editable values
    if (updatedOptions[1]) {
      updatedOptions[1].provider = editableEcoTariff.provider;
      updatedOptions[1].basePrice = editableEcoTariff.basePrice;
      updatedOptions[1].energyPrice = editableEcoTariff.energyPrice;
    }
    // Swap 1 and 2
    const temp = updatedOptions[1];
    updatedOptions[1] = updatedOptions[2];
    updatedOptions[2] = temp;
  }, [editableEcoTariff]);

  // Calculate costs for each contract option
  const prepareContractData = () => {
    // Make a copy of contract options and swap positions 1 and 2
    const reorderedOptions = [...contractOptions];
    if (reorderedOptions.length >= 3) {
      const temp = reorderedOptions[1];
      reorderedOptions[1] = reorderedOptions[2];
      reorderedOptions[2] = temp;
    }
    
    // Update eco tariff with editable values
    if (reorderedOptions.length >= 3) {
      reorderedOptions[2] = {
        ...reorderedOptions[2],
        name: "Öko Strom Basic",
        provider: editableEcoTariff.provider,
        basePrice: editableEcoTariff.basePrice,
        energyPrice: editableEcoTariff.energyPrice
      };
    }

    return reorderedOptions.map((option) => {
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

  const handleSelectContract = (contract: ContractOption, index: number) => {
    // Make a copy of contract options and swap positions 1 and 2
    const reorderedOptions = [...contractOptions];
    if (reorderedOptions.length >= 3) {
      const temp = reorderedOptions[1];
      reorderedOptions[1] = reorderedOptions[2];
      reorderedOptions[2] = temp;
    }
    
    // Update eco tariff with editable values
    if (index === 2) {
      const updatedContract = {
        ...reorderedOptions[index],
        provider: editableEcoTariff.provider,
        basePrice: editableEcoTariff.basePrice,
        energyPrice: editableEcoTariff.energyPrice
      };
      
      if (selectedContract?.name === updatedContract.name) {
        onSelectContract(undefined); // Deselect if already selected
      } else {
        onSelectContract(updatedContract); // Select new contract
      }
    } else {
      if (selectedContract?.name === reorderedOptions[index].name) {
        onSelectContract(undefined); // Deselect if already selected
      } else {
        onSelectContract(reorderedOptions[index]); // Select new contract
      }
    }
  };

  const handleEcoTariffChange = (field: keyof typeof editableEcoTariff, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setEditableEcoTariff(prev => ({
        ...prev,
        [field]: numValue
      }));
    } else if (field === 'provider') {
      setEditableEcoTariff(prev => ({
        ...prev,
        [field]: value
      }));
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
          const isSelected = selectedContract?.name === (index === 2 ? "Öko Strom Basic" : contractOptions[index === 1 ? 2 : index].name);
          const isEditableTariff = index === 2;
          
          const tarifDate = index === 0 
            ? datesConfig.lastTariffsUpdate.flex 
            : (index === 1 
                ? datesConfig.lastTariffsUpdate.standard 
                : datesConfig.lastTariffsUpdate.eco);

          return (
            <Card 
              key={index} 
              className={cn(
                "transition-all duration-200",
                isSelected ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
              )}
            >
              <CardHeader className={isEditableTariff ? "pb-2" : ""}>
                <CardTitle>{contract.name}</CardTitle>
                <CardDescription>
                  <span>
                    {isEditableTariff ? (
                      <Input 
                        value={editableEcoTariff.provider}
                        onChange={(e) => handleEcoTariffChange('provider', e.target.value)}
                        className="mt-1 py-1"
                      />
                    ) : (
                      <>Anbieter: {contract.provider}</>
                    )}
                  </span>
                  <div className="text-xs text-muted-foreground mt-2">Stand: {tarifDate}</div>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Arbeitspreis */}
                  <div className="space-y-1">
                    <div className="font-medium text-sm text-energy-primary">Arbeitspreis:</div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Energiekosten</span>
                      <span className="text-energy-primary font-medium">
                        {isEditableTariff ? (
                          <Input 
                            type="number"
                            value={editableEcoTariff.energyPrice}
                            onChange={(e) => handleEcoTariffChange('energyPrice', e.target.value)}
                            className="w-24 py-1 inline-block"
                          />
                        ) : (
                          <>
                            {index === 1 
                              ? contractOptions[2].energyPrice.toFixed(2)
                              : contractOptions[index].energyPrice.toFixed(2)
                            } Cent / kWh
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  
                  {/* Fixkosten */}
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Fixkosten:</div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Grundpreis</span>
                      <span>
                        {isEditableTariff ? (
                          <Input 
                            type="number"
                            value={editableEcoTariff.basePrice}
                            onChange={(e) => handleEcoTariffChange('basePrice', e.target.value)}
                            className="w-24 py-1 inline-block"
                          />
                        ) : (
                          <>
                            {contract.basePrice.toFixed(2)} € / Jahr
                          </>
                        )}
                      </span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Netzkosten</span>
                      <span>{contract.networkCosts.toFixed(2)} € / Jahr</span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm">
                      <span>Energiekosten</span>
                      <span className="text-energy-primary font-medium">{contract.energyCosts.toFixed(2)} € / Jahr</span>
                    </div>
                    <div className="pl-4 flex justify-between text-sm font-medium">
                      <span>Fixkosten gesamt</span>
                      <span>{(contract.fixedCosts + contract.energyCosts).toFixed(2)} € / Jahr</span>
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
                  <div className="text-xs text-muted-foreground text-center mt-2">
                    Jahresverbrauch: {annualConsumption} kWh
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button 
                  variant={isSelected ? "default" : "outline"} 
                  size="sm"
                  onClick={() => handleSelectContract(
                    index === 2 ? 
                      {...contractOptions[index], 
                        provider: editableEcoTariff.provider, 
                        basePrice: editableEcoTariff.basePrice, 
                        energyPrice: editableEcoTariff.energyPrice
                      } : 
                      contractOptions[index === 1 ? 2 : index],
                    index
                  )}
                  className={isSelected ? "bg-primary hover:bg-primary/90" : ""}
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
