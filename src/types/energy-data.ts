
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
