import { describe, expect, it } from 'vitest';
import tariffDataJson from '@/config/tariff-costs.json';
import {
  calculateNetworkCosts,
  calculateTariffCosts,
  ChartContractOption,
  contractPricePerKwh,
  effectiveEnergyCentPerKwh,
  fixedFeeEurPerYear,
  TariffDataConfig,
} from './useTariffData';

const data = tariffDataJson as TariffDataConfig;
const tariff = (id: string) => data.tariffs.find((item) => item.id === id)!;
const levy = data.networkCosts.gebrauchsabgabe_rate;

describe('network cost calculation (Wiener Netze NE7, 2026)', () => {
  it('matches the hand-computed 3500 kWh total', () => {
    const result = calculateNetworkCosts(data.networkCosts, 3500, 0.2);
    // Netznutzung 244.30 + Leistungspauschale 54 + Netzverlust 24.50 + Messleistung 26.16 = 348.96
    const networkCharges = 348.96;
    const expectedNet = networkCharges * 1.07 + 3.5 + (3.796 + 21.7) + 19.02;

    expect(result.calculated.total_excl_tax).toBeCloseTo(expectedNet, 6);
    expect(result.calculated.total_excl_tax).toBeCloseTo(421.40, 2);
    expect(result.calculated.total_incl_tax).toBeCloseTo(505.68, 2);
  });

  it('levies the Gebrauchsabgabe only on network charges, not on federal levies', () => {
    const result = calculateNetworkCosts(data.networkCosts, 3500, 0.2);
    const gebrauchsabgabe = result.groups
      .flatMap((group) => group.items)
      .find((item) => item.label.startsWith('Gebrauchsabgabe'))!;
    expect(gebrauchsabgabe.amount).toBeCloseTo(348.96 * 0.07, 6);
  });

  it('scales only the per-kWh components with consumption', () => {
    const low = calculateNetworkCosts(data.networkCosts, 0, 0.2).calculated.total_excl_tax;
    // Fixed parts: (Leistungspauschale + Messleistung) incl. Gebrauchsabgabe + EAG fixed parts.
    expect(low).toBeCloseTo((54 + 26.16) * 1.07 + 3.796 + 19.02, 6);

    const perKwhCent = (6.98 + 0.7) * 1.07 + 0.1 + 0.62;
    const diff = calculateNetworkCosts(data.networkCosts, 2000, 0.2).calculated.total_excl_tax -
      calculateNetworkCosts(data.networkCosts, 1000, 0.2).calculated.total_excl_tax;
    expect(diff).toBeCloseTo(perKwhCent * 10, 6);
  });

  it('applies the given VAT rate once', () => {
    const result = calculateNetworkCosts(data.networkCosts, 3500, 0.19);
    expect(result.calculated.tax_amount).toBeCloseTo(result.calculated.total_excl_tax * 0.19, 9);
  });
});

describe('tariff cost calculation', () => {
  it('reproduces Wien Energie gross prices (which already include the 7 % Gebrauchsabgabe)', () => {
    const result = calculateTariffCosts(tariff('wien-energie-optima'), 3500, 0.2, levy);
    // Price sheet: 12.8272 ct/kWh and 75.9675 EUR/yr gross incl. Gebrauchsabgabe and USt.
    expect(result.calculated!.energiekosten_incl_tax).toBeCloseTo(12.8272 * 35 + 75.9675, 0);
  });

  it('applies the per-kWh first-year bonus and the energy levy', () => {
    const verbund = calculateTariffCosts(tariff('verbund-oesterreich'), 3500, 0.2, levy);
    expect(verbund.rabatte?.total).toBeCloseTo(-175, 9);
    expect(verbund.calculated?.gebrauchsabgabe).toBeCloseTo((525 + 50.4 - 175) * 0.07, 9);
    expect(verbund.calculated?.energiekosten_excl_tax).toBeCloseTo((525 + 50.4 - 175) * 1.07, 9);
    expect(effectiveEnergyCentPerKwh(tariff('verbund-oesterreich'))).toBeCloseTo(10, 9);
  });

  it('prices only the known parts of the spot tariff', () => {
    const spot = calculateTariffCosts(tariff('awattar-hourly'), 3500, 0.2, levy);
    expect(spot.calculated?.energiekosten_excl_tax).toBeCloseTo((57.5 + 52.5) * 1.07, 9);
  });

  it('keeps energy costs positive at low consumption', () => {
    const verbund = calculateTariffCosts(tariff('verbund-oesterreich'), 200, 0.2, levy);
    expect(verbund.calculated!.energiekosten_excl_tax).toBeGreaterThan(0);
  });
});

describe('contract price per kWh (chart lines)', () => {
  const contractFor = (id: string): ChartContractOption => {
    const source = tariff(id);
    const isSpot = source.type === 'spot';
    return {
      name: source.name,
      provider: source.provider,
      fixedFeeEurYear: fixedFeeEurPerYear(source),
      energyPrice: isSpot ? 0 : effectiveEnergyCentPerKwh(source),
      networkCosts: (consumption) => calculateNetworkCosts(data.networkCosts, consumption, 0.2).calculated.total_excl_tax,
      pricing: isSpot ? 'spot' : 'fixed',
      spotMarkupCentKwh: isSpot ? source.verwaltungsgebuehr_cent_kwh : undefined,
      energyLevyRate: levy,
    };
  };

  it.each(['wien-energie-optima', 'verbund-oesterreich', 'custom'])(
    'matches the yearly card total for %s',
    (id) => {
      const consumption = 3500;
      const energy = calculateTariffCosts(tariff(id), consumption, 0.2, levy).calculated!.energiekosten_incl_tax;
      const network = calculateNetworkCosts(data.networkCosts, consumption, 0.2).calculated.total_incl_tax;
      const perKwh = contractPricePerKwh(contractFor(id), consumption, 0.2, 0);
      expect(perKwh.totalTaxed).toBeCloseTo(((energy + network) / consumption) * 100, 9);
    }
  );

  it('includes the spot base fee and markup on top of the market price', () => {
    const consumption = 3500;
    const spot = contractPricePerKwh(contractFor('awattar-hourly'), consumption, 0.2, 8);
    expect(spot.energy).toBeCloseTo(8 + 1.5 + (57.5 / consumption) * 100, 9);
    // At a market price of 0 the line equals the known yearly costs per kWh.
    const atZero = contractPricePerKwh(contractFor('awattar-hourly'), consumption, 0.2, 0);
    const energy = calculateTariffCosts(tariff('awattar-hourly'), consumption, 0.2, levy).calculated!.energiekosten_incl_tax;
    const network = calculateNetworkCosts(data.networkCosts, consumption, 0.2).calculated.total_incl_tax;
    expect(atZero.totalTaxed).toBeCloseTo(((energy + network) / consumption) * 100, 9);
  });
});
