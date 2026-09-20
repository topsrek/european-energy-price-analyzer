
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NetworkCosts } from '@/types/energy-data';

interface NetworkCostsDisplayProps {
  networkCosts: NetworkCosts;
  consumption: number;
}

const NetworkCostsDisplay: React.FC<NetworkCostsDisplayProps> = ({ networkCosts, consumption }) => {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>{networkCosts.name}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Gültig für alle Tarife - Jahresverbrauch: {consumption} kWh
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="font-medium text-sm">Netznutzungsentgelt:</div>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Arbeitspreis</span>
                <span>{networkCosts.calculated.arbeitspreis.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Grundpauschale</span>
                <span>{networkCosts.breakdown.netznutzungsentgelt.grundpauschale.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">Weitere Kosten:</div>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Netzverlustentgelt</span>
                <span>{networkCosts.breakdown.netzverlustentgelt.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Entgelt für Messleistungen</span>
                <span>{networkCosts.breakdown.messleistungen.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="font-medium text-sm">Abgaben:</div>
            <div className="pl-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span>Elektrizitätsabgabe</span>
                <span>{networkCosts.breakdown.abgaben.elektrizitaetsabgabe.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Erneuerbaren-Förderbeitrag</span>
                <span>{networkCosts.breakdown.abgaben.erneuerbaren_foerderbeitrag.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between">
                <span>Erneuerbaren-Förderpauschale</span>
                <span>{networkCosts.breakdown.abgaben.erneuerbaren_foerderpauschale.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          <div className="border-t pt-2">
            <div className="flex justify-between font-medium">
              <span>Netzkosten exkl. USt.</span>
              <span>{networkCosts.calculated.total_excl_tax.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Umsatzsteuer +20%</span>
              <span>{networkCosts.calculated.tax_amount.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1">
              <span>Netzkosten inkl. USt.</span>
              <span>{networkCosts.calculated.total_incl_tax.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NetworkCostsDisplay;
