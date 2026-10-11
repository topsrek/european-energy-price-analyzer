
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ContractOption, Tariff } from '@/types/energy-data';
import { cn } from '@/lib/utils';
import { ChartContractOption, effectiveEnergyCentPerKwh, fixedFeeEurPerYear, useTariffData } from '@/hooks/useTariffData';
import NetworkCostsDisplay from './NetworkCostsDisplay';
import ConsumptionSlider from './ConsumptionSlider';

interface ContractOptionsProps {
  annualConsumption: number;
  onAnnualConsumptionChange: (value: number) => void;
  onSelectContract: (contract: ContractOption | undefined) => void;
  selectedContract?: ContractOption;
  vatRate: number;
}

const formatVatPercent = (vatRate: number) => `${Number((vatRate * 100).toFixed(1))}%`;

const ContractOptions: React.FC<ContractOptionsProps> = ({
  annualConsumption,
  onAnnualConsumptionChange,
  onSelectContract,
  selectedContract,
  vatRate
}) => {
  const { data, energyLevyRate, calculateNetworkCostsForConsumption, calculateTariffCostsForConsumption } = useTariffData(vatRate);
  const vatLabel = `USt. (${formatVatPercent(vatRate)}):`;
  const levyLabel = `Gebrauchsabgabe (${Number((energyLevyRate * 100).toFixed(2))} %):`;
  const customDefaults = data.tariffs.find((tariff) => tariff.id === 'custom');
  const [editableValues, setEditableValues] = useState({
    provider: customDefaults?.provider ?? 'Eigene Eingabe',
    arbeitspreis_cent_kwh: customDefaults?.arbeitspreis_cent_kwh ?? 12,
    grundpauschale: customDefaults?.grundpauschale ?? 50
  });

  const networkCosts = calculateNetworkCostsForConsumption(annualConsumption);

  const withEditableValues = (tariff: Tariff, values: typeof editableValues): Tariff => ({
    ...tariff,
    provider: values.provider,
    arbeitspreis_cent_kwh: Number.isFinite(values.arbeitspreis_cent_kwh) ? values.arbeitspreis_cent_kwh : 0,
    grundpauschale: Number.isFinite(values.grundpauschale) ? values.grundpauschale : 0,
  });

  const buildContractOption = (tariff: Tariff): ChartContractOption => {
    const isSpot = tariff.type === 'spot';
    return {
      name: tariff.name,
      provider: tariff.provider,
      fixedFeeEurYear: fixedFeeEurPerYear(tariff),
      // Per-kWh discounts (e.g. a first-year bonus) are part of the effective energy price.
      energyPrice: isSpot ? 0 : effectiveEnergyCentPerKwh(tariff),
      // Net (excl. VAT) network costs for the given yearly consumption; the chart adds VAT once.
      networkCosts: (consumption) => calculateNetworkCostsForConsumption(consumption).calculated.total_excl_tax,
      pricing: isSpot ? 'spot' : 'fixed',
      spotMarkupCentKwh: isSpot ? tariff.verwaltungsgebuehr_cent_kwh ?? 0 : undefined,
      energyLevyRate,
    };
  };

  const handleEditableChange = (field: keyof typeof editableValues, value: string | number) => {
    const nextValues = {
      ...editableValues,
      [field]: typeof value === 'string' ? value : Number(value)
    };
    setEditableValues(nextValues);

    // Keep the chart in sync while the selected custom tariff is being edited.
    if (customDefaults && selectedContract?.name === customDefaults.name) {
      onSelectContract(buildContractOption(withEditableValues(customDefaults, nextValues)));
    }
  };

  const handleSelectContract = (tariff: Tariff) => {
    if (selectedContract?.name === tariff.name) {
      onSelectContract(undefined);
    } else {
      onSelectContract(buildContractOption(tariff));
    }
  };

  const safeToFixed = (value: number | undefined, decimals: number = 2): string => {
    return (value || 0).toFixed(decimals);
  };

  const renderTariffCard = (tariff: Tariff, index: number) => {
    const isSelected = selectedContract?.name === tariff.name;
    const isCustom = tariff.id === 'custom';
    const isSpot = tariff.type === 'spot';
    const calculatedTariff = calculateTariffCostsForConsumption(
      isCustom ? withEditableValues(tariff, editableValues) : tariff,
      annualConsumption
    );
    
    // Ensure calculated object exists
    if (!calculatedTariff.calculated) {
      calculatedTariff.calculated = {
        arbeitspreis_total: 0,
        energiekosten_excl_tax: 0,
        tax_amount: 0,
        energiekosten_incl_tax: 0
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
            {!isCustom && (
              <div className="text-xs text-muted-foreground">
                Stand: {tariff.stand ?? data.lastUpdated}
                {tariff.source_url && (
                  <>
                    {' · '}
                    <a href={tariff.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                      Quelle
                    </a>
                  </>
                )}
              </div>
            )}
            {tariff.note && <div className="text-xs text-muted-foreground">{tariff.note}</div>}
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
                  
                  {calculatedTariff.rabatte?.details?.map((detail) => (
                    <React.Fragment key={detail.name}>
                      <span className="text-primary">{detail.name}:</span>
                      <span className="text-right font-medium text-primary">{safeToFixed(detail.amount)} €</span>
                    </React.Fragment>
                  ))}

                  {energyLevyRate > 0 && (
                    <>
                      <span className="text-muted-foreground">{levyLabel}</span>
                      <span className="text-right font-medium">{safeToFixed(calculatedTariff.calculated.gebrauchsabgabe)} €</span>
                    </>
                  )}
                </div>
                
                <div className="border-t pt-3 space-y-1">
                  <div className="grid grid-cols-2 gap-y-1 text-sm">
                    <span className="text-muted-foreground">Netto:</span>
                    <span className="text-right font-semibold">{safeToFixed(calculatedTariff.calculated.energiekosten_excl_tax)} €</span>
                    
                    <span className="text-muted-foreground">{vatLabel}</span>
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
                  
                  <span className="text-muted-foreground">{vatLabel}</span>
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
                
                <span className="text-muted-foreground">Aufschlag auf Spotpreis:</span>
                <span className="text-right font-medium">{safeToFixed(tariff.verwaltungsgebuehr_cent_kwh)} cent/kWh</span>
                
                <span className="text-muted-foreground">Aufschlag gesamt:</span>
                <span className="text-right font-medium">{safeToFixed(calculatedTariff.calculated?.arbeitspreis_total)} € / Jahr</span>

                {energyLevyRate > 0 && (
                  <>
                    <span className="text-muted-foreground">{levyLabel}</span>
                    <span className="text-right font-medium">{safeToFixed(calculatedTariff.calculated?.gebrauchsabgabe)} € / Jahr</span>
                  </>
                )}
              </div>
              
              <div className="text-xs text-secondary mt-2 p-2 bg-secondary/15 dark:bg-secondary/20 rounded">
                + stündlicher Spotpreis (inkl. Gebrauchsabgabe) + Netzkosten + Steuern
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
        config={data.networkCosts}
        consumption={annualConsumption}
        vatRate={vatRate}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.tariffs.map((tariff, index) => renderTariffCard(tariff, index))}
      </div>
    </div>
  );
};

export default ContractOptions;
