
import { useState, useEffect } from 'react';
import tariffData from '@/config/tariff-costs.json';

interface TariffData {
  lastUpdated: string;
  networkCosts: any;
  tariffs: any[];
}

export const useTariffData = () => {
  const [data, setData] = useState<TariffData>(tariffData);

  const updateCustomTariff = (updates: Partial<any>) => {
    setData(prev => ({
      ...prev,
      tariffs: prev.tariffs.map(tariff => 
        tariff.id === 'custom' 
          ? { ...tariff, ...updates }
          : tariff
      )
    }));
  };

  const calculateNetworkCostsForConsumption = (consumption: number) => {
    const networkCosts = data.networkCosts;
    const workPricePerKwh = networkCosts.breakdown.netznutzungsentgelt.arbeitspreis / 3500; // Base calculation per kWh
    
    const calculatedWorkPrice = workPricePerKwh * consumption;
    const totalExclTax = calculatedWorkPrice + 
      networkCosts.breakdown.netznutzungsentgelt.grundpauschale +
      networkCosts.breakdown.netzverlustentgelt +
      networkCosts.breakdown.messleistungen +
      networkCosts.breakdown.abgaben.total;
    
    const taxAmount = totalExclTax * networkCosts.tax_rate;
    const totalInclTax = totalExclTax + taxAmount;

    return {
      ...networkCosts,
      calculated: {
        arbeitspreis: calculatedWorkPrice,
        total_excl_tax: totalExclTax,
        tax_amount: taxAmount,
        total_incl_tax: totalInclTax
      }
    };
  };

  const calculateTariffCostsForConsumption = (tariff: any, consumption: number) => {
    if (tariff.type === 'spot') {
      return tariff; // Spot tariffs are calculated differently
    }

    const energyPricePerKwh = tariff.arbeitspreis_gesamt / 3500; // Base calculation per kWh
    const calculatedEnergyPrice = energyPricePerKwh * consumption;
    
    const totalExclTax = calculatedEnergyPrice + tariff.grundpauschale + (tariff.rabatte?.total || 0);
    const taxAmount = totalExclTax * tariff.tax_rate;
    const totalInclTax = totalExclTax + taxAmount;

    return {
      ...tariff,
      calculated: {
        energiepreis: calculatedEnergyPrice + tariff.grundpauschale,
        arbeitspreis_gesamt: calculatedEnergyPrice,
        energiekosten_excl_tax: totalExclTax,
        tax_amount: taxAmount,
        energiekosten_incl_tax: totalInclTax
      }
    };
  };

  return {
    data,
    updateCustomTariff,
    calculateNetworkCostsForConsumption,
    calculateTariffCostsForConsumption
  };
};
