
import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ContractOption } from '@/types/energy-data';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ContractOptionsProps {
  annualConsumption: number;
  onAnnualConsumptionChange: (value: number) => void;
  contractOptions: ContractOption[];
}

const ContractOptions: React.FC<ContractOptionsProps> = ({
  annualConsumption,
  onAnnualConsumptionChange,
  contractOptions
}) => {
  const [consumption, setConsumption] = useState<string>(annualConsumption.toString());
  const [showFixedCosts, setShowFixedCosts] = useState<boolean>(true);
  const [showFixedCostsBreakdown, setShowFixedCostsBreakdown] = useState<boolean>(false);

  const handleUpdate = () => {
    const parsedValue = parseFloat(consumption);
    if (!isNaN(parsedValue) && parsedValue > 0) {
      onAnnualConsumptionChange(parsedValue);
    }
  };

  // Calculate costs for each contract option for the chart
  const prepareChartData = () => {
    return contractOptions.map((option) => {
      const networkCosts = option.networkCosts(annualConsumption);
      const energyCosts = (option.energyPrice * annualConsumption) / 100;
      const basePrice = option.basePrice;
      const totalFixedCosts = networkCosts + basePrice;
      const tax = (energyCosts + totalFixedCosts) * 0.2; // 20% VAT

      return {
        name: option.name,
        provider: option.provider,
        energyCosts: parseFloat(energyCosts.toFixed(2)),
        fixedCosts: parseFloat(totalFixedCosts.toFixed(2)),
        networkCosts: parseFloat(networkCosts.toFixed(2)),
        basePrice: parseFloat(basePrice.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat((energyCosts + totalFixedCosts + tax).toFixed(2)),
      };
    });
  };

  const chartData = prepareChartData();

  // Custom tooltip for the bar chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-md shadow-md">
          <p className="font-medium">{data.name} - {data.provider}</p>
          <p className="text-sm">Stromkosten: {data.energyCosts.toFixed(2)} €</p>
          {showFixedCosts && (
            <p className="text-sm">Fixkosten: {data.fixedCosts.toFixed(2)} €</p>
          )}
          <p className="text-sm">Umsatzsteuer: {data.tax.toFixed(2)} €</p>
          <p className="text-sm font-medium">Gesamt: {data.total.toFixed(2)} €</p>
        </div>
      );
    }
    return null;
  };

  // Dialog for fixed cost breakdown
  const FixedCostsBreakdownDialog = ({ contract }: { contract: any }) => {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full">
            Fixkosten anzeigen
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fixkosten für {contract.name}</DialogTitle>
            <DialogDescription>
              Aufschlüsselung der fixen Kosten für {contract.provider}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-sm">Grundpreis:</div>
              <div className="text-sm text-right font-medium">{contract.basePrice.toFixed(2)} €</div>
              <div className="text-sm">Netzkosten:</div>
              <div className="text-sm text-right font-medium">{contract.networkCosts.toFixed(2)} €</div>
              <div className="text-sm font-medium">Gesamte Fixkosten:</div>
              <div className="text-sm text-right font-medium">{contract.fixedCosts.toFixed(2)} €</div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Die Netzkosten werden basierend auf dem Jahresverbrauch und dem Tarif der Wiener Netze berechnet.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div className="flex-1">
          <Label htmlFor="annualConsumption" className="mb-2 block">
            Jahresverbrauch (kWh)
          </Label>
          <Input
            id="annualConsumption"
            type="number"
            min="0"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            placeholder="z.B. 3500"
          />
        </div>
        <Button onClick={handleUpdate}>Aktualisieren</Button>
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="show-fixed-costs"
          checked={showFixedCosts}
          onCheckedChange={setShowFixedCosts}
        />
        <Label htmlFor="show-fixed-costs">Fixkosten anzeigen (Netzkosten + Grundgebühr)</Label>
      </div>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis label={{ value: 'Euro pro Jahr', angle: -90, position: 'insideLeft' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar dataKey="energyCosts" name="Stromkosten" stackId="a" fill="#4285f4" />
            {showFixedCosts && (
              <Bar dataKey="fixedCosts" name="Fixkosten" stackId="a" fill="#fbbc05" />
            )}
            <Bar dataKey="tax" name="Umsatzsteuer" stackId="a" fill="#34a853" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {chartData.map((contract, index) => (
          <Card key={index} className={index === 0 ? "border-energy-secondary" : ""}>
            {index === 0 && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-energy-secondary text-white px-3 py-1 rounded-full text-xs font-medium">
                Günstigste Option
              </div>
            )}
            
            <CardHeader>
              <CardTitle>{contract.name}</CardTitle>
              <CardDescription>Anbieter: {contract.provider}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Grundpreis:</span>
                  <span className="font-medium">{contract.basePrice.toFixed(2)} € / Jahr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Arbeitspreis:</span>
                  <span className="font-medium">{contractOptions[index].energyPrice.toFixed(2)} Cent / kWh</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Netzkosten:</span>
                  <span className="font-medium">{contract.networkCosts.toFixed(2)} € / Jahr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Stromkosten:</span>
                  <span className="font-medium">{contract.energyCosts.toFixed(2)} € / Jahr</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Umsatzsteuer (20%):</span>
                  <span className="font-medium">{contract.tax.toFixed(2)} € / Jahr</span>
                </div>
                <div className="border-t pt-2 mt-2 flex justify-between font-medium">
                  <span>Jahreskosten:</span>
                  <span>{contract.total.toFixed(2)} €</span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <FixedCostsBreakdownDialog contract={contract} />
              <Button variant="outline" size="sm">
                Tarif auswählen
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ContractOptions;
