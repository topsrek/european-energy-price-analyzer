
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContractOption } from '@/types/energy-data';
import { cn } from '@/lib/utils';
import { useTariffData } from '@/hooks/useTariffData';
import NetworkCostsDisplay from './NetworkCostsDisplay';
import ConsumptionSlider from './ConsumptionSlider';

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
  const { data, updateCustomTariff, calculateNetworkCostsForConsumption, calculateTariffCostsForConsumption } = useTariffData();
  const [editableValues, setEditableValues] = useState({
    provider: 'Eigene Eingabe',
    energiepreis: 1000,
    grundpauschale: 50
  });

  const networkCosts = calculateNetworkCostsForConsumption(annualConsumption);

  const handleEditableChange = (field: string, value: string | number) => {
    setEditableValues(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? value : Number(value)
    }));
  };

  const handleSelectContract = (tariff: any) => {
    // Convert tariff data to ContractOption format for compatibility
    const contractOption: ContractOption = {
      name: tariff.name,
      provider: tariff.provider,
      basePrice: tariff.calculated?.energiekosten_incl_tax || tariff.grundgebuehr || 0,
      energyPrice: 0, // Will be calculated based on consumption
      networkCosts: () => networkCosts.calculated.total_incl_tax
    };

    if (selectedContract?.name === tariff.name) {
      onSelectContract(undefined);
    } else {
      onSelectContract(contractOption);
    }
  };

  const renderTariffCard = (tariff: any, index: number) => {
    const isSelected = selectedContract?.name === tariff.name;
    const isCustom = tariff.id === 'custom';
    const isSpot = tariff.type === 'spot';
    const calculatedTariff = calculateTariffCostsForConsumption(tariff, annualConsumption);
    
    if (isCustom) {
      // Use editable values for custom tariff
      calculatedTariff.provider = editableValues.provider;
      calculatedTariff.calculated = {
        energiepreis: editableValues.energiepreis,
        energiekosten_excl_tax: editableValues.energiepreis - editableValues.grundpauschale,
        tax_amount: (editableValues.energiepreis - editableValues.grundpauschale) * 0.2,
        energiekosten_incl_tax: editableValues.energiepreis * 1.2
      };
    }

    const totalCostsExclTax = (calculatedTariff.calculated?.energiekosten_excl_tax || 0) + networkCosts.calculated.total_excl_tax;
    const totalTaxAmount = (calculatedTariff.calculated?.tax_amount || 0) + networkCosts.calculated.tax_amount;
    const totalCostsInclTax = totalCostsExclTax + totalTaxAmount;

    return (
      <Card 
        key={tariff.id} 
        className={cn(
          "transition-all duration-200",
          isSelected ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
        )}
      >
        <CardHeader>
          <CardTitle>{tariff.name}</CardTitle>
          <CardDescription>
            {isCustom ? (
              <Input 
                value={editableValues.provider}
                onChange={(e) => handleEditableChange('provider', e.target.value)}
                className="mt-1 py-1"
              />
            ) : (
              <>Anbieter: {tariff.provider}</>
            )}
            <div className="text-xs text-muted-foreground mt-2">Stand: {data.lastUpdated}</div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {!isSpot ? (
              <>
                {/* Energy Costs Section */}
                <div className="space-y-2">
                  <div className="font-medium text-sm text-primary">Energiekosten:</div>
                  <div className="pl-4 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Energiepreis</span>
                      <span>
                        {isCustom ? (
                          <Input 
                            type="number"
                            value={editableValues.energiepreis}
                            onChange={(e) => handleEditableChange('energiepreis', e.target.value)}
                            className="w-24 py-1 inline-block"
                          />
                        ) : (
                          `${calculatedTariff.calculated.energiepreis.toFixed(2)} €`
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Arbeitspreis gesamt</span>
                      <span>{calculatedTariff.calculated.arbeitspreis_gesamt.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Grundpauschale</span>
                      <span>
                        {isCustom ? (
                          <Input 
                            type="number"
                            value={editableValues.grundpauschale}
                            onChange={(e) => handleEditableChange('grundpauschale', e.target.value)}
                            className="w-24 py-1 inline-block"
                          />
                        ) : (
                          `${tariff.grundpauschale.toFixed(2)} €`
                        )}
                      </span>
                    </div>
                    {tariff.rabatte?.total !== 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Rabatte</span>
                        <span>{tariff.rabatte.total.toFixed(2)} €</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="pl-4 border-t pt-2">
                    <div className="flex justify-between font-medium">
                      <span>Energiekosten exkl. USt.</span>
                      <span>{calculatedTariff.calculated.energiekosten_excl_tax.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Umsatzsteuer +20%</span>
                      <span>{calculatedTariff.calculated.tax_amount.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Energiekosten inkl. USt.</span>
                      <span>{calculatedTariff.calculated.energiekosten_incl_tax.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>

                {/* Total Costs Section */}
                <div className="space-y-2 bg-accent/10 p-3 rounded">
                  <div className="font-medium text-sm">Gesamtjahreskosten:</div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Gesamt exkl. USt.</span>
                      <span>{totalCostsExclTax.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Umsatzsteuer +20%</span>
                      <span>{totalTaxAmount.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-1">
                      <span>Gesamt inkl. USt.</span>
                      <span>{totalCostsInclTax.toFixed(2)} €</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="font-medium text-sm text-primary">Spot Tarif:</div>
                <div className="pl-4 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Grundgebühr</span>
                    <span>{tariff.grundgebuehr.toFixed(2)} € / Jahr</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Verwaltungsgebühr</span>
                    <span>{tariff.verwaltungsgebuehr.toFixed(2)} € / Jahr</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-2">
                    + aktueller Spotpreis + Netzkosten + Steuern
                  </div>
                </div>
              </div>
            )}

            <div className="text-xs text-muted-foreground text-center">
              Jahresverbrauch: {annualConsumption} kWh
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end">
          <Button 
            variant={isSelected ? "default" : "outline"} 
            size="sm"
            onClick={() => handleSelectContract(calculatedTariff)}
            className={isSelected ? "bg-primary hover:bg-primary/90" : ""}
          >
            {isSelected ? "Ausgewählt" : "In Preisvergleich anzeigen"}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <ConsumptionSlider 
        value={annualConsumption}
        onChange={onAnnualConsumptionChange}
      />

      <NetworkCostsDisplay 
        networkCosts={networkCosts}
        consumption={annualConsumption}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.tariffs.map((tariff, index) => renderTariffCard(tariff, index))}
      </div>
    </div>
  );
};

export default ContractOptions;
