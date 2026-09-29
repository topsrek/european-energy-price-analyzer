import { useState } from 'react';
import tariffDataJson from '@/config/tariff-costs.json';
import { ContractOption, NetworkCosts, Tariff, TariffData, TariffRabatte } from '@/types/energy-data';

/**
 * Contract option handed to the chart. `pricing: 'spot'` means the energy price follows
 * the day-ahead market price plus `spotMarkupCentKwh` instead of a fixed `energyPrice`.
 */
export interface ChartContractOption extends ContractOption {
  pricing?: 'fixed' | 'spot';
  spotMarkupCentKwh?: number;
}

type RabattDetailConfig = NonNullable<TariffRabatte['details']>[number] & {
  /** Consumption-dependent discount in cent per kWh (negative). Overrides the fixed `amount`. */
  cent_kwh?: number;
};

type NetworkCostsConfig = NetworkCosts & {
  /**
   * Consumption the absolute per-kWh components in `breakdown` were quoted for.
   * Per-kWh rates are derived as amount / reference_consumption_kwh.
   */
  reference_consumption_kwh?: number;
};

export type TariffDataConfig = Omit<TariffData, 'networkCosts'> & { networkCosts: NetworkCostsConfig };

const tariffData = tariffDataJson as TariffDataConfig;

const DEFAULT_REFERENCE_CONSUMPTION_KWH = 3500;

/**
 * Scales the consumption-dependent network components (Netznutzung-Arbeitspreis,
 * Netzverlustentgelt, Elektrizitätsabgabe, Erneuerbaren-Förderbeitrag) linearly with
 * consumption; Grundpauschale, Messleistungen and Förderpauschale stay fixed per year.
 */
export const calculateNetworkCosts = (
  networkCosts: NetworkCostsConfig,
  consumption: number,
  vatRate: number,
) => {
  const reference = networkCosts.reference_consumption_kwh ?? DEFAULT_REFERENCE_CONSUMPTION_KWH;
  const scale = (referenceAmount: number) => (referenceAmount / reference) * consumption;
  const { breakdown } = networkCosts;

  const arbeitspreis = scale(breakdown.netznutzungsentgelt.arbeitspreis);
  const netzverlustentgelt = scale(breakdown.netzverlustentgelt);
  const elektrizitaetsabgabe = scale(breakdown.abgaben.elektrizitaetsabgabe);
  const erneuerbarenFoerderbeitrag = scale(breakdown.abgaben.erneuerbaren_foerderbeitrag);
  const abgabenTotal = elektrizitaetsabgabe + erneuerbarenFoerderbeitrag + breakdown.abgaben.erneuerbaren_foerderpauschale;

  const totalExclTax = arbeitspreis +
    breakdown.netznutzungsentgelt.grundpauschale +
    netzverlustentgelt +
    breakdown.messleistungen +
    abgabenTotal;
  const taxAmount = totalExclTax * vatRate;

  return {
    ...networkCosts,
    breakdown: {
      ...breakdown,
      netznutzungsentgelt: { ...breakdown.netznutzungsentgelt, arbeitspreis },
      netzverlustentgelt,
      abgaben: {
        ...breakdown.abgaben,
        elektrizitaetsabgabe,
        erneuerbaren_foerderbeitrag: erneuerbarenFoerderbeitrag,
        total: abgabenTotal,
      },
    },
    tax_rate: vatRate,
    calculated: {
      arbeitspreis,
      total_excl_tax: totalExclTax,
      tax_amount: taxAmount,
      total_incl_tax: totalExclTax + taxAmount,
    },
  };
};

const scaleRabatte = (rabatte: TariffRabatte | undefined, consumption: number): TariffRabatte | undefined => {
  if (!rabatte) return rabatte;
  const details = (rabatte.details as RabattDetailConfig[] | undefined)?.map((detail) =>
    typeof detail.cent_kwh === 'number'
      ? { ...detail, amount: (detail.cent_kwh / 100) * consumption }
      : detail
  );
  if (!details?.length) return rabatte;
  return { ...rabatte, details, total: details.reduce((sum, detail) => sum + detail.amount, 0) };
};

export const calculateTariffCosts = (tariff: Tariff, consumption: number, vatRate: number): Tariff => {
  if (tariff.type === 'spot') {
    // Spot tariffs: only the fixed fee and the per-kWh admin markup are known in advance.
    const verwaltungskosten = ((tariff.verwaltungsgebuehr_cent_kwh ?? 0) / 100) * consumption;
    const totalExclTax = (tariff.grundgebuehr ?? 0) + verwaltungskosten;
    const taxAmount = totalExclTax * vatRate;

    return {
      ...tariff,
      tax_rate: vatRate,
      calculated: {
        arbeitspreis_total: verwaltungskosten,
        energiekosten_excl_tax: totalExclTax,
        tax_amount: taxAmount,
        energiekosten_incl_tax: totalExclTax + taxAmount,
      },
    };
  }

  const arbeitspreisTotal = ((tariff.arbeitspreis_cent_kwh ?? 0) / 100) * consumption;
  const rabatte = scaleRabatte(tariff.rabatte, consumption);
  const totalExclTax = arbeitspreisTotal + (tariff.grundpauschale ?? 0) + (rabatte?.total || 0);
  const taxAmount = totalExclTax * vatRate;

  return {
    ...tariff,
    rabatte,
    tax_rate: vatRate,
    calculated: {
      arbeitspreis_total: arbeitspreisTotal,
      energiekosten_excl_tax: totalExclTax,
      tax_amount: taxAmount,
      energiekosten_incl_tax: totalExclTax + taxAmount,
    },
  };
};

export const useTariffData = (vatRate: number) => {
  const [data, setData] = useState<TariffDataConfig>(tariffData);

  const updateCustomTariff = (updates: Partial<Tariff>) => {
    setData(prev => ({
      ...prev,
      tariffs: prev.tariffs.map(tariff =>
        tariff.id === 'custom'
          ? { ...tariff, ...updates }
          : tariff
      )
    }));
  };

  const calculateNetworkCostsForConsumption = (consumption: number) =>
    calculateNetworkCosts(data.networkCosts, consumption, vatRate);

  const calculateTariffCostsForConsumption = (tariff: Tariff, consumption: number) =>
    calculateTariffCosts(tariff, consumption, vatRate);

  return {
    data,
    updateCustomTariff,
    calculateNetworkCostsForConsumption,
    calculateTariffCostsForConsumption
  };
};
