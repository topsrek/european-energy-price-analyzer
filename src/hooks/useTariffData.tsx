import { useState } from 'react';
import tariffDataJson from '@/config/tariff-costs.json';
import { ContractOption, NetworkCostsConfig, Tariff, TariffData, TariffRabatte } from '@/types/energy-data';

/**
 * Contract option handed to the chart. `pricing: 'spot'` means the energy price follows
 * the day-ahead market price plus `spotMarkupCentKwh` instead of a fixed `energyPrice`.
 * `energyLevyRate` is a surcharge on the energy price (Gebrauchsabgabe Wien), applied before VAT.
 */
export interface ChartContractOption extends ContractOption {
  pricing?: 'fixed' | 'spot';
  spotMarkupCentKwh?: number;
  energyLevyRate?: number;
  /** Shown next to the contract name in the chart, e.g. "1. Lieferjahr" for first-year bonuses. */
  priceNote?: string;
}

type RabattDetailConfig = NonNullable<TariffRabatte['details']>[number] & {
  /** Consumption-dependent discount in cent per kWh (negative). Overrides the fixed `amount`. */
  cent_kwh?: number;
};

export type TariffDataConfig = TariffData;

const tariffData = tariffDataJson as TariffDataConfig;

export interface CostLineItem {
  label: string;
  amount: number;
}

export interface CostGroup {
  label: string;
  items: CostLineItem[];
}

export interface CalculatedNetworkCosts {
  name: string;
  groups: CostGroup[];
  calculated: {
    total_excl_tax: number;
    tax_amount: number;
    total_incl_tax: number;
  };
}

const perKwh = (centPerKwh: number, consumption: number) => (centPerKwh / 100) * consumption;

const formatCent = (value: number) =>
  `${value.toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ct/kWh`;

const formatPercent = (rate: number) => `${Number((rate * 100).toFixed(2)).toLocaleString('de-AT')} %`;

/**
 * Yearly network costs (net of VAT) for the given consumption. The Gebrauchsabgabe is levied
 * on the network charges (Netznutzung, Netzverluste, Messleistung) but not on the federal
 * levies (Elektrizitätsabgabe, EAG-Förderbeitrag/-pauschale).
 */
export const calculateNetworkCosts = (
  config: NetworkCostsConfig,
  consumption: number,
  vatRate: number,
): CalculatedNetworkCosts => {
  const arbeitspreis = perKwh(config.netznutzung_arbeitspreis_cent_kwh, consumption);
  const netzverlust = perKwh(config.netzverlust_cent_kwh, consumption);
  const networkCharges = arbeitspreis + config.netznutzung_leistungspauschale_eur_jahr + netzverlust + config.messleistung_eur_jahr;
  const gebrauchsabgabe = networkCharges * config.gebrauchsabgabe_rate;
  const elektrizitaetsabgabe = perKwh(config.elektrizitaetsabgabe_cent_kwh, consumption);
  const foerderbeitrag = perKwh(config.erneuerbaren_foerderbeitrag_cent_kwh, consumption) + config.erneuerbaren_foerderbeitrag_eur_jahr;

  const groups: CostGroup[] = [
    {
      label: 'Netznutzungsentgelt',
      items: [
        { label: `Arbeitspreis (${formatCent(config.netznutzung_arbeitspreis_cent_kwh)})`, amount: arbeitspreis },
        { label: 'Leistungspauschale', amount: config.netznutzung_leistungspauschale_eur_jahr },
      ],
    },
    {
      label: 'Weitere Netzentgelte',
      items: [
        { label: `Netzverlustentgelt (${formatCent(config.netzverlust_cent_kwh)})`, amount: netzverlust },
        { label: 'Entgelt für Messleistungen', amount: config.messleistung_eur_jahr },
      ],
    },
    {
      label: 'Abgaben',
      items: [
        { label: `Gebrauchsabgabe Wien (${formatPercent(config.gebrauchsabgabe_rate)} auf Netzentgelte)`, amount: gebrauchsabgabe },
        { label: `Elektrizitätsabgabe (${formatCent(config.elektrizitaetsabgabe_cent_kwh)})`, amount: elektrizitaetsabgabe },
        { label: 'Erneuerbaren-Förderbeitrag', amount: foerderbeitrag },
        { label: 'Erneuerbaren-Förderpauschale', amount: config.erneuerbaren_foerderpauschale_eur_jahr },
      ],
    },
  ];

  const totalExclTax = networkCharges + gebrauchsabgabe + elektrizitaetsabgabe + foerderbeitrag + config.erneuerbaren_foerderpauschale_eur_jahr;
  const taxAmount = totalExclTax * vatRate;

  return {
    name: config.name,
    groups,
    calculated: {
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

/**
 * Yearly energy costs. `energyLevyRate` is the Gebrauchsabgabe on the energy price (incl.
 * base fee), which suppliers delivering in Vienna add before VAT.
 */
export const calculateTariffCosts = (
  tariff: Tariff,
  consumption: number,
  vatRate: number,
  energyLevyRate = 0,
): Tariff => {
  if (tariff.type === 'spot') {
    // Spot tariffs: only the fixed fee and the per-kWh markup are known in advance.
    const verwaltungskosten = perKwh(tariff.verwaltungsgebuehr_cent_kwh ?? 0, consumption);
    const energyNet = (tariff.grundgebuehr ?? 0) + verwaltungskosten;
    const levy = energyNet * energyLevyRate;
    const totalExclTax = energyNet + levy;
    const taxAmount = totalExclTax * vatRate;

    return {
      ...tariff,
      tax_rate: vatRate,
      calculated: {
        arbeitspreis_total: verwaltungskosten,
        gebrauchsabgabe: levy,
        energiekosten_excl_tax: totalExclTax,
        tax_amount: taxAmount,
        energiekosten_incl_tax: totalExclTax + taxAmount,
      },
    };
  }

  const arbeitspreisTotal = perKwh(tariff.arbeitspreis_cent_kwh ?? 0, consumption);
  const rabatte = scaleRabatte(tariff.rabatte, consumption);
  const energyNet = arbeitspreisTotal + (tariff.grundpauschale ?? 0) + (rabatte?.total || 0);
  const levy = energyNet * energyLevyRate;
  const totalExclTax = energyNet + levy;
  const taxAmount = totalExclTax * vatRate;

  return {
    ...tariff,
    rabatte,
    tax_rate: vatRate,
    calculated: {
      arbeitspreis_total: arbeitspreisTotal,
      gebrauchsabgabe: levy,
      energiekosten_excl_tax: totalExclTax,
      tax_amount: taxAmount,
      energiekosten_incl_tax: totalExclTax + taxAmount,
    },
  };
};

/** Net fixed supplier fee per year (Grundpauschale/Grundgebühr) plus fixed (non per-kWh) discounts. */
export const fixedFeeEurPerYear = (tariff: Tariff) => {
  const fixedDiscounts = ((tariff.rabatte?.details ?? []) as RabattDetailConfig[])
    .reduce((sum, detail) => sum + (typeof detail.cent_kwh === 'number' ? 0 : detail.amount), 0);
  const baseFee = (tariff.type === 'spot' ? tariff.grundgebuehr : tariff.grundpauschale) ?? 0;
  return baseFee + fixedDiscounts;
};

/** True if the tariff has per-kWh discounts, which are first-year (new-customer) bonuses. */
export const hasFirstYearBonus = (tariff: Tariff) =>
  ((tariff.rabatte?.details ?? []) as RabattDetailConfig[]).some((detail) => typeof detail.cent_kwh === 'number');

/** The tariff without its discounts, i.e. the regular price from the second supply year on. */
export const withoutDiscounts = (tariff: Tariff): Tariff => ({
  ...tariff,
  rabatte: tariff.rabatte ? { ...tariff.rabatte, total: 0, details: [] } : tariff.rabatte,
});

/** Effective net energy price per kWh after per-kWh discounts (e.g. a first-year bonus). */
export const effectiveEnergyCentPerKwh = (tariff: Tariff) => {
  const perKwhDiscount = ((tariff.rabatte?.details ?? []) as RabattDetailConfig[])
    .reduce((sum, detail) => sum + (detail.cent_kwh ?? 0), 0);
  return (tariff.arbeitspreis_cent_kwh ?? 0) + perKwhDiscount;
};

export interface ContractPricePerKwh {
  /** Net energy price incl. the fixed fee spread over the consumption (ct/kWh). */
  energy: number;
  /** `energy` plus net network costs (ct/kWh). */
  withNetwork: number;
  /** Everything incl. Gebrauchsabgabe and VAT (ct/kWh); matches the card's yearly total / kWh. */
  totalTaxed: number;
}

/**
 * Per-kWh contract prices for one market interval. `marketNetCentPerKwh` is the net spot price and
 * is only used by spot contracts. The fixed supplier fee is spread over the yearly consumption.
 */
export const contractPricePerKwh = (
  contract: ChartContractOption,
  consumption: number,
  vatRate: number,
  marketNetCentPerKwh: number,
): ContractPricePerKwh => {
  const netNetwork = (contract.networkCosts(consumption) / consumption) * 100;
  const fixedFee = (contract.fixedFeeEurYear / consumption) * 100;
  const variable = contract.pricing === 'spot'
    ? marketNetCentPerKwh + (contract.spotMarkupCentKwh ?? 0)
    : contract.energyPrice;
  const energy = variable + fixedFee;
  // Gebrauchsabgabe on the energy price; network costs already include their own share.
  const energyLevyFactor = 1 + (contract.energyLevyRate ?? 0);
  return {
    energy,
    withNetwork: energy + netNetwork,
    totalTaxed: (energy * energyLevyFactor + netNetwork) * (1 + vatRate),
  };
};

export const useTariffData = (vatRate: number) => {
  const [data] = useState<TariffDataConfig>(tariffData);
  const energyLevyRate = data.networkCosts.gebrauchsabgabe_rate;

  const calculateNetworkCostsForConsumption = (consumption: number) =>
    calculateNetworkCosts(data.networkCosts, consumption, vatRate);

  const calculateTariffCostsForConsumption = (tariff: Tariff, consumption: number) =>
    calculateTariffCosts(tariff, consumption, vatRate, energyLevyRate);

  return {
    data,
    energyLevyRate,
    calculateNetworkCostsForConsumption,
    calculateTariffCostsForConsumption
  };
};
