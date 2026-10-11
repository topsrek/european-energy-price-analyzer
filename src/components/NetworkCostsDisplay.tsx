import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CalculatedNetworkCosts } from '@/hooks/useTariffData';
import type { NetworkCostsConfig } from '@/types/energy-data';

interface NetworkCostsDisplayProps {
  networkCosts: CalculatedNetworkCosts;
  config: NetworkCostsConfig;
  consumption: number;
  vatRate: number;
}

const formatVatPercent = (vatRate: number) => `${Number((vatRate * 100).toFixed(1))}%`;

const NetworkCostsDisplay: React.FC<NetworkCostsDisplayProps> = ({ networkCosts, config, consumption, vatRate }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{networkCosts.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gültig für alle Tarife - Jahresverbrauch: {consumption} kWh - Tarife gültig ab {config.validFrom}
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {networkCosts.groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <div className="font-medium text-sm">{group.label}:</div>
              <div className="pl-4 space-y-1 text-sm">
                {group.items.map((item) => (
                  <div key={item.label} className="flex justify-between gap-4">
                    <span>{item.label}</span>
                    <span className="whitespace-nowrap">{item.amount.toFixed(2)} €</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="border-t pt-2">
            <div className="flex justify-between font-medium">
              <span>Netzkosten exkl. USt.</span>
              <span>{networkCosts.calculated.total_excl_tax.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Umsatzsteuer +{formatVatPercent(vatRate)}</span>
              <span>{networkCosts.calculated.tax_amount.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Netzkosten inkl. USt.</span>
              <span>{networkCosts.calculated.total_incl_tax.toFixed(2)} €</span>
            </div>
          </div>

          {(config.notes?.length || config.sources?.length) ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Hinweise &amp; Quellen</summary>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                {config.notes?.map((note) => <li key={note}>{note}</li>)}
                {config.sources?.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                      {source.name}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

export default NetworkCostsDisplay;
