import { describe, expect, it } from 'vitest';
import tariffDataJson from '@/config/tariff-costs.json';
import { calculateNetworkCosts, calculateTariffCosts, TariffDataConfig } from './useTariffData';

const data = tariffDataJson as TariffDataConfig;
const tariff = (id: string) => data.tariffs.find((item) => item.id === id)!;

describe('tariff cost calculation', () => {
  it('keeps the published 3500 kWh network cost numbers unchanged', () => {
    const result = calculateNetworkCosts(data.networkCosts, 3500, 0.2);

    expect(result.calculated.arbeitspreis).toBeCloseTo(621.6, 9);
    expect(result.breakdown.netzverlustentgelt).toBeCloseTo(58.8, 9);
    expect(result.breakdown.abgaben.elektrizitaetsabgabe).toBeCloseTo(126, 9);
    expect(result.breakdown.abgaben.erneuerbaren_foerderbeitrag).toBeCloseTo(71.56, 9);
    expect(result.breakdown.abgaben.total).toBeCloseTo(216.58, 9);
    expect(result.calculated.total_excl_tax).toBeCloseTo(971.14, 9);
    expect(result.calculated.tax_amount).toBeCloseTo(194.228, 9);
    expect(result.calculated.total_incl_tax).toBeCloseTo(1165.368, 9);
  });

  it('scales every per-kWh network component with consumption', () => {
    const result = calculateNetworkCosts(data.networkCosts, 1750, 0.2);

    expect(result.breakdown.netzverlustentgelt).toBeCloseTo(29.4, 9);
    expect(result.breakdown.abgaben.elektrizitaetsabgabe).toBeCloseTo(63, 9);
    expect(result.breakdown.abgaben.erneuerbaren_foerderbeitrag).toBeCloseTo(35.78, 9);
    // Fixed parts: Grundpauschale 48, Messleistungen 26.16, Förderpauschale 19.02.
    expect(result.calculated.total_excl_tax).toBeCloseTo(310.8 + 48 + 29.4 + 26.16 + 63 + 35.78 + 19.02, 9);
  });

  it('keeps the published 3500 kWh tariff numbers unchanged', () => {
    const flex = calculateTariffCosts(tariff('flex'), 3500, 0.2);
    expect(flex.rabatte?.total).toBeCloseTo(-703.5, 9);
    expect(flex.calculated?.arbeitspreis_total).toBeCloseTo(1411.9, 9);
    expect(flex.calculated?.energiekosten_excl_tax).toBeCloseTo(1411.9 + 50 - 703.5, 9);

    const standard = calculateTariffCosts(tariff('standard'), 3500, 0.2);
    expect(standard.calculated?.energiekosten_excl_tax).toBeCloseTo(1150.1 + 50, 9);
    expect(standard.calculated?.energiekosten_incl_tax).toBeCloseTo((1150.1 + 50) * 1.2, 9);

    const spot = calculateTariffCosts(tariff('spot'), 3500, 0.2);
    expect(spot.calculated?.energiekosten_excl_tax).toBeCloseTo(120 + 87.5, 9);
  });

  it('never lets the free-energy discount exceed the energy cost at low consumption', () => {
    const flex = calculateTariffCosts(tariff('flex'), 500, 0.2);
    expect(flex.calculated!.arbeitspreis_total + (flex.rabatte?.total ?? 0)).toBeGreaterThan(0);
    expect(flex.calculated!.energiekosten_excl_tax).toBeGreaterThan(0);
  });

  it('applies the given VAT rate', () => {
    const result = calculateNetworkCosts(data.networkCosts, 3500, 0.19);
    expect(result.calculated.tax_amount).toBeCloseTo(971.14 * 0.19, 9);
  });
});
