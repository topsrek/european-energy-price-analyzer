
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContractOption, Tariff } from '@/types/energy-data';
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
    arbeitspreis_cent_kwh: 27.14,
    grundpauschale: 50
  });

  const networkCosts = calculateNetworkCostsForConsumption(annualConsumption);

  const handleEditableChange = (field: string, value: string | number) => {
    setEditableValues(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? value : Number(value)
    }));
  };

  const handleSelectContract = (tariff: Tariff) => {
    // Convert tariff data to ContractOption format for compatibility
    const contractOption: ContractOption = {
      name: tariff.name,
      provider: tariff.provider,
      basePrice: tariff.calculated?.energiekosten_incl_tax || tariff.grundgebuehr || 0,
      energyPrice: tariff.arbeitspreis_cent_kwh || 0,
      networkCosts: () => networkCosts.calculated?.total_incl_tax || 0
    };

    if (selectedContract?.name === tariff.name) {
      onSelectContract(undefined);
    } else {
      onSelectContract(contractOption);
    }
  };

  const safeToFixed = (value: number | undefined, decimals: number = 2): string => {
    return (value || 0).toFixed(decimals);
  };

  const renderTariffCard = (tariff: Tariff, index: number) => {
    const isSelected = selectedContract?.name === tariff.name;
    const isCustom = tariff.id === 'custom';
    const isSpot = tariff.type === 'spot';
    const calculatedTariff = calculateTariffCostsForConsumption(tariff, annualConsumption);
    
    // Ensure calculated object exists
    if (!calculatedTariff.calculated) {
      calculatedTariff.calculated = {
        arbeitspreis_total: 0,
        energiekosten_excl_tax: 0,
        tax_amount: 0,
        energiekosten_incl_tax: 0
      };
    }
    
    if (isCustom) {
      // Use editable values for custom tariff
      calculatedTariff.provider = editableValues.provider;
      calculatedTariff.arbeitspreis_cent_kwh = editableValues.arbeitspreis_cent_kwh;
      calculatedTariff.grundpauschale = editableValues.grundpauschale;
      
      const arbeitspreisTotal = (editableValues.arbeitspreis_cent_kwh / 100) * annualConsumption;
      const totalExclTax = arbeitspreisTotal + editableValues.grundpauschale;
      const taxAmount = totalExclTax * 0.2;
      
      calculatedTariff.calculated = {
        arbeitspreis_total: arbeitspreisTotal,
        energiekosten_excl_tax: totalExclTax,
        tax_amount: taxAmount,
        energiekosten_incl_tax: totalExclTax + taxAmount
      };
    }

    // Ensure network costs calculated object exists
    const safeNetworkCosts = networkCosts.calculated || {
      total_excl_tax: 0,
      tax_amount: 0,
      total_incl_tax: 0
    };

    const totalCostsExclTax = (calculatedTariff.calculated.energiekosten_excl_tax || 0) + (safeNetworkCosts.total_excl_tax || 0);
    const totalTaxAmount = (calculatedTariff.calculated.tax_amount || 0) + (safeNetworkCosts.tax_amount || 0);
    const totalCostsInclTax = totalCostsExclTax + totalTaxAmount;

    return (
      <Card 
        key={tariff.id} 
        className={cn(
          "transition-all duration-200",
          isSelected ? "ring-2 ring-primary shadow-lg" : "hover:shadow-md"
        )}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">{tariff.name}</CardTitle>
          <div className="space-y-1">
            {isCustom ? (
              <Input 
                value={editableValues.provider}
                onChange={(e) => handleEditableChange('provider', e.target.value)}
                className="mt-1 py-1 text-sm"
                placeholder="Anbieter eingeben"
              />
            ) : (
              <CardDescription className="font-medium">{tariff.provider}</CardDescription>
            )}
            <div className="text-xs text-muted-foreground">Stand: {data.lastUpdated}</div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {!isSpot ? (
            <>
              {/* Tariff Costs Section */}
              <div className="bg-primary/10 dark:bg-primary/15 p-4 rounded-lg space-y-3">
                <h4 className="font-semibold text-primary text-sm">Nettostromkosten</h4>
                
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <span className="text-muted-foreground">Arbeitspreis:</span>
                  <span className="text-right font-medium">
                    {isCustom ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input 
                          type="number"
                          step="0.01"
                          value={editableValues.arbeitspreis_cent_kwh}
                          onChange={(e) => handleEditableChange('arbeitspreis_cent_kwh', parseFloat(e.target.value))}
                          className="w-20 py-1 text-xs text-right"
                        />
                        <span className="text-xs">cent/kWh</span>
                      </div>
                    ) : (
                      `${safeToFixed(calculatedTariff.arbeitspreis_cent_kwh)} cent/kWh`
                    )}
                  </span>
                  
                  <span className="text-muted-foreground">Arbeitspreis gesamt:</span>
                  <span className="text-right font-medium">{safeToFixed(calculatedTariff.calculated.arbeitspreis_total)} €</span>
                  
                  <span className="text-muted-foreground">Grundpauschale:</span>
                  <span className="text-right font-medium">
                    {isCustom ? (
                      <div className="flex items-center justify-end gap-1">
                        <Input 
                          type="number"
                          step="0.01"
                          value={editableValues.grundpauschale}
                          onChange={(e) => handleEditableChange('grundpauschale', parseFloat(e.target.value))}
                          className="w-16 py-1 text-xs text-right"
                        />
                        <span className="text-xs">€</span>
                      </div>
                    ) : (
                      `${safeToFixed(calculatedTariff.grundpauschale)} €`
                    )}
                  </span>
                  
                  {calculatedTariff.rabatte?.total !== 0 && (
                    <>
                      <span className="text-primary">Rabatte:</span>
                      <span className="text-right font-medium text-primary">{safeToFixed(calculatedTariff.rabatte?.total)} €</span>
                    </>
                  )}
                </div>
                
                <div className="border-t pt-3 space-y-1">
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Netto:</span>
                    <span className="text-right font-semibold">{safeToFixed(calculatedTariff.calculated.energiekosten_excl_tax)} €</span>
                    
                    <span className="text-muted-foreground">USt. (20%):</span>
                    <span className="text-right">{safeToFixed(calculatedTariff.calculated.tax_amount)} €</span>
                    
                    <span className="font-semibold">Brutto:</span>
                    <span className="text-right font-bold text-primary">{safeToFixed(calculatedTariff.calculated.energiekosten_incl_tax)} €</span>
                  </div>
                </div>
              </div>

              {/* Total Annual Costs */}
              <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg space-y-3">
                <h4 className="font-semibold text-gray-800 dark:text-gray-200 text-sm">Gesamtjahreskosten (inkl. Netzkosten)</h4>
                
                <div className="grid grid-cols-2 gap-y-1 text-sm">
                  <span className="text-muted-foreground">Gesamt netto:</span>
                  <span className="text-right font-semibold">{safeToFixed(totalCostsExclTax)} €</span>
                  
                  <span className="text-muted-foreground">USt. (20%):</span>
                  <span className="text-right">{safeToFixed(totalTaxAmount)} €</span>
                  
                  <span className="font-bold text-lg">Gesamt brutto:</span>
                  <span className="text-right font-bold text-lg text-primary">{safeToFixed(totalCostsInclTax)} €</span>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-secondary/10 dark:bg-secondary/15 p-4 rounded-lg space-y-3">
              <h4 className="font-semibold text-secondary text-sm">Spot Tarif</h4>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Grundgebühr:</span>
                <span className="text-right font-medium">{safeToFixed(tariff.grundgebuehr)} € / Jahr</span>
                
                <span className="text-muted-foreground">Verwaltungsgebühr:</span>
                <span className="text-right font-medium">{safeToFixed(tariff.verwaltungsgebuehr_cent_kwh)} cent/kWh</span>
                
                <span className="text-muted-foreground">Verwaltung gesamt:</span>
                <span className="text-right font-medium">{safeToFixed(calculatedTariff.calculated?.arbeitspreis_total)} € / Jahr</span>
              </div>
              
              <div className="text-xs text-secondary mt-2 p-2 bg-secondary/15 dark:bg-secondary/20 rounded">
                + aktueller Spotpreis + Netzkosten + Steuern
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground bg-gray-100 dark:bg-gray-800 p-2 rounded">
            Jahresverbrauch: {annualConsumption.toLocaleString()} kWh
          </div>
        </CardContent>
        
        <CardFooter className="pt-4">
          <Button 
            variant={isSelected ? "default" : "outline"} 
            size="sm"
            onClick={() => handleSelectContract(calculatedTariff)}
            className={cn(
              "w-full",
              isSelected ? "bg-primary hover:bg-primary/90" : ""
            )}
          >
            {isSelected ? "✓ Ausgewählt" : "In Preisvergleich anzeigen"}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.tariffs.map((tariff, index) => renderTariffCard(tariff, index))}
      </div>
    </div>
  );
};

export default ContractOptions;
