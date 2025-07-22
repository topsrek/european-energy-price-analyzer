
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
    // Use the actual arbeitspreis directly instead of dividing by hardcoded base consumption
    const calculatedWorkPrice = (networkCosts.breakdown.netznutzungsentgelt.arbeitspreis * consumption) / 1000; // Convert to proper units
    
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
      // For spot tariffs, calculate administrative fee
      const verwaltungskosten = (tariff.verwaltungsgebuehr_cent_kwh / 100) * consumption;
      const totalExclTax = tariff.grundgebuehr + verwaltungskosten;
      const taxAmount = totalExclTax * tariff.tax_rate;
      const totalInclTax = totalExclTax + taxAmount;

      return {
        ...tariff,
        calculated: {
          arbeitspreis_total: (tariff.verwaltungsgebuehr_cent_kwh / 100) * consumption,
          energiekosten_excl_tax: totalExclTax,
          tax_amount: taxAmount,
          energiekosten_incl_tax: totalInclTax
        }
      };
    }

    // For regular tariffs
    const arbeitspreisTotal = (tariff.arbeitspreis_cent_kwh / 100) * consumption;
    const totalExclTax = arbeitspreisTotal + tariff.grundpauschale + (tariff.rabatte?.total || 0);
    const taxAmount = totalExclTax * tariff.tax_rate;
    const totalInclTax = totalExclTax + taxAmount;

    return {
      ...tariff,
      calculated: {
        arbeitspreis_total: arbeitspreisTotal,
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
