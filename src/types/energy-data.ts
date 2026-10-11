
export interface EnergyPrice {
  timestamp: string; // ISO string
  price: number; // Price in €/MWh or cent/kWh
  unit: 'EUR_MWh' | 'cent_kWh';
}

export type DataResolution = 'hourly' | 'interval';

export interface ComparisonSeries {
  id: string;
  label: string;
  shortLabel?: string;
  color: string;
  energyPrices: EnergyPrice[];
}

export interface SmartMeterData {
  timestamp: string; // ISO string
  consumption: number; // Consumption in kWh
}

export interface ContractOption {
  name: string;
  provider: string;
  fixedFeeEurYear: number; // Net (excl. levy/VAT) fixed supplier fee in € per year, incl. fixed discounts
  energyPrice: number; // cent per kWh
  networkCosts: (totalConsumption: number) => number; // Function to calculate network costs
}

export type AveragingOption = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'daily-cycle' | 'none';

export type FilterOptions = {
  months: number[]; // 0-11 (January to December)
  weekdays: number[]; // 0-6 (Sunday to Saturday)
  hours: number[]; // 0-23
  daysOfMonth: number[]; // 1-31
  weeksOfYear: number[]; // 1-53
};

export interface TariffRabatte {
  total: number;
  details?: Array<{
    name: string;
    amount: number;
  }>;
}

export interface TariffCalculated {
  arbeitspreis_total: number;
  /** Gebrauchsabgabe (municipal levy) on the energy costs, net of VAT. */
  gebrauchsabgabe?: number;
  energiekosten_excl_tax: number;
  tax_amount: number;
  energiekosten_incl_tax: number;
}

export interface Tariff {
  id: string;
  name: string;
  provider: string;
  arbeitspreis_cent_kwh?: number;
  grundpauschale?: number;
  grundgebuehr?: number;
  editable?: boolean;
  rabatte?: TariffRabatte;
  tax_rate: number;
  type?: 'spot' | 'fixed';
  verwaltungsgebuehr_cent_kwh?: number;
  /** Date or validity window of the published price. */
  stand?: string;
  note?: string;
  source_url?: string;
  calculated?: TariffCalculated;
}

/** Regulated network charges and levies, all net of VAT, as published rates. */
export interface NetworkCostsConfig {
  name: string;
  validFrom: string;
  notes?: string[];
  netznutzung_arbeitspreis_cent_kwh: number;
  netznutzung_leistungspauschale_eur_jahr: number;
  netzverlust_cent_kwh: number;
  messleistung_eur_jahr: number;
  /** Municipal levy on network charges and on the energy price (Gebrauchsabgabe Wien). */
  gebrauchsabgabe_rate: number;
  elektrizitaetsabgabe_cent_kwh: number;
  erneuerbaren_foerderbeitrag_cent_kwh: number;
  erneuerbaren_foerderbeitrag_eur_jahr: number;
  erneuerbaren_foerderpauschale_eur_jahr: number;
  sources?: Array<{ name: string; url: string }>;
}

export interface TariffData {
  lastUpdated: string;
  networkCosts: NetworkCostsConfig;
  tariffs: Tariff[];
}
