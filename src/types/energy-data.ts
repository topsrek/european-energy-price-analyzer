
export interface EnergyPrice {
  timestamp: string; // ISO string
  price: number; // Price in €/MWh or cent/kWh
  unit: 'EUR_MWh' | 'cent_kWh';
}

export interface SmartMeterData {
  timestamp: string; // ISO string
  consumption: number; // Consumption in kWh
}

export interface ContractOption {
  name: string;
  provider: string;
  basePrice: number; // € per year
  energyPrice: number; // cent per kWh
  networkCosts: (totalConsumption: number) => number; // Function to calculate network costs
}

export type AveragingOption = 'hourly' | 'daily' | 'monthly' | 'daily-cycle' | 'none';

export type FilterOptions = {
  months: number[]; // 0-11 (January to December)
  weekdays: number[]; // 0-6 (Sunday to Saturday)
  hours: number[]; // 0-23
};

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor: string;
    backgroundColor: string;
    yAxisID: string;
    borderWidth?: number;
    pointRadius?: number;
    fill?: boolean;
  }[];
}

export interface TariffRabatte {
  total: number;
  details?: Array<{
    name: string;
    amount: number;
  }>;
}

export interface TariffCalculated {
  arbeitspreis_total: number;
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
  calculated?: TariffCalculated;
}

export interface NetworkCostsCalculated {
  arbeitspreis: number;
  total_excl_tax: number;
  tax_amount: number;
  total_incl_tax: number;
}

export interface NetworkCosts {
  name: string;
  netztarif: number;
  breakdown: {
    netznutzungsentgelt: {
      arbeitspreis: number;
      grundpauschale: number;
    };
    netzverlustentgelt: number;
    messleistungen: number;
    abgaben: {
      elektrizitaetsabgabe: number;
      erneuerbaren_foerderbeitrag: number;
      erneuerbaren_foerderpauschale: number;
      total: number;
    };
  };
  total_excl_tax: number;
  tax_rate: number;
  tax_amount: number;
  total_incl_tax: number;
  calculated?: NetworkCostsCalculated;
}

export interface TariffData {
  lastUpdated: string;
  networkCosts: NetworkCosts;
  tariffs: Tariff[];
}
