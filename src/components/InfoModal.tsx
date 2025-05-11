
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';

interface InfoModalProps {
  trigger?: React.ReactNode;
}

const InfoModal: React.FC<InfoModalProps> = ({ trigger }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="icon">
            <HelpCircle className="h-6 w-6" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Der Strommarkt in Österreich</DialogTitle>
          <DialogDescription>
            Informationen über den Strommarkt, Preise und Verbrauch
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <Tabs defaultValue="market">
            <TabsList className="mb-4">
              <TabsTrigger value="market">Strommarkt</TabsTrigger>
              <TabsTrigger value="prices">Preise</TabsTrigger>
              <TabsTrigger value="consumption">Verbrauch</TabsTrigger>
              <TabsTrigger value="international">Internationaler Vergleich</TabsTrigger>
            </TabsList>
            
            <TabsContent value="market" className="space-y-4">
              <h3 className="text-lg font-semibold">Struktur des Strommarkts</h3>
              <p>
                Der österreichische Strommarkt ist seit 2001 liberalisiert. Dies bedeutet, dass Sie Ihren
                Stromanbieter frei wählen können, während der Netzbetreiber durch Ihren Wohnort festgelegt ist.
              </p>
              
              <h4 className="text-md font-medium mt-4">Akteure im Strommarkt</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Netzbetreiber</strong>: In Wien ist das Wiener Netze. Sie sind für die Strominfrastruktur 
                  und den Transport des Stroms zu Ihrem Haus zuständig. Die Netzgebühren sind reguliert und unabhängig 
                  vom gewählten Stromanbieter.
                </li>
                <li>
                  <strong>Stromlieferanten</strong>: Anbieter wie Wien Energie, Verbund, oder EVN verkaufen den Strom an Endkunden.
                  Sie konkurrieren um Kunden und bieten verschiedene Tarife an.
                </li>
                <li>
                  <strong>Stromerzeuger</strong>: Unternehmen, die Strom in Wasserkraftwerken, Windparks, Solaranlagen oder 
                  thermischen Kraftwerken produzieren.
                </li>
                <li>
                  <strong>Stromhändler</strong>: Akteure, die am Großhandelsmarkt Strom kaufen und verkaufen.
                </li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Day-Ahead-Auktionen</h4>
              <p>
                Ein zentraler Mechanismus der Preisbildung am Strommarkt sind die Day-Ahead-Auktionen. Dabei wird
                der Strompreis für jede Stunde des folgenden Tages im Voraus festgelegt. Anbieter geben Angebote ab, 
                zu welchem Preis sie bereit sind, eine bestimmte Menge Strom zu verkaufen. Abnehmer geben Gebote ab, 
                zu welchem Preis sie bereit sind, eine bestimmte Menge zu kaufen. Der Marktpreis wird dort festgelegt, 
                wo sich Angebot und Nachfrage treffen.
              </p>
              <p className="mt-2">
                Diese Auktionen finden an der EPEX Spot statt, der europäischen Strombörse. Die Preise schwanken je nach 
                Tageszeit, Wetterbedingungen und anderen Faktoren erheblich.
              </p>
            </TabsContent>
            
            <TabsContent value="prices" className="space-y-4">
              <h3 className="text-lg font-semibold">Strompreise und Einheiten</h3>
              <p>
                Der Strompreis setzt sich aus mehreren Komponenten zusammen:
              </p>
              
              <h4 className="text-md font-medium mt-4">Preiskomponenten</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Energiepreis</strong>: Der eigentliche Preis für den Strom, den Sie verbrauchen. Wird in Cent/kWh angegeben.
                </li>
                <li>
                  <strong>Grundgebühr</strong>: Eine fixe monatliche oder jährliche Gebühr, unabhängig vom Verbrauch.
                </li>
                <li>
                  <strong>Netzgebühren</strong>: Kosten für Transport und Verteilung des Stroms. Besteht aus einem 
                  verbrauchsabhängigen Teil (Cent/kWh) und einer Grundgebühr.
                </li>
                <li>
                  <strong>Steuern und Abgaben</strong>: Mehrwertsteuer, Ökostromabgabe, Elektrizitätsabgabe etc.
                </li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Einheiten im Strommarkt</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>kWh (Kilowattstunde)</strong>: Standardeinheit für den Energieverbrauch im Haushalt.
                </li>
                <li>
                  <strong>MWh (Megawattstunde)</strong>: 1 MWh = 1.000 kWh, wird oft im Großhandel verwendet.
                </li>
                <li>
                  <strong>Cent/kWh</strong>: Übliche Einheit für Endkundenpreise.
                </li>
                <li>
                  <strong>Euro/MWh</strong>: Übliche Einheit für Großhandelspreise.
                </li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Typische Preise in Österreich</h4>
              <p>
                Die Endkundenpreise für Haushaltskunden in Österreich liegen typischerweise zwischen 8-15 Cent/kWh für den reinen
                Energiepreis, je nach Anbieter und Tarifmodell. Mit allen Gebühren, Steuern und Abgaben kommen Verbraucher in der Regel
                auf Gesamtkosten zwischen 20-30 Cent/kWh.
              </p>
            </TabsContent>
            
            <TabsContent value="consumption" className="space-y-4">
              <h3 className="text-lg font-semibold">Stromverbrauch</h3>
              
              <h4 className="text-md font-medium mt-4">Typischer Verbrauch von Haushalten</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Einpersonenhaushalt</strong>: ca. 1.500-2.500 kWh pro Jahr
                </li>
                <li>
                  <strong>Zweipersonenhaushalt</strong>: ca. 2.500-3.500 kWh pro Jahr
                </li>
                <li>
                  <strong>Vierpersonenhaushalt</strong>: ca. 4.000-5.000 kWh pro Jahr
                </li>
                <li>
                  <strong>Mit elektrischer Warmwasserbereitung</strong>: +800-1.200 kWh pro Jahr
                </li>
                <li>
                  <strong>Mit elektrischer Heizung</strong>: +5.000-10.000 kWh pro Jahr, je nach Wohnfläche und Dämmung
                </li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Typischer Verbrauch von Geräten</h4>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="text-left py-2">Gerät</th>
                    <th className="text-left py-2">Typischer Verbrauch</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1">Kühlschrank</td>
                    <td>100-200 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Gefrierschrank</td>
                    <td>200-400 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Waschmaschine</td>
                    <td>150-250 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Wäschetrockner</td>
                    <td>300-500 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Spülmaschine</td>
                    <td>200-300 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Fernseher (LCD)</td>
                    <td>100-300 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">Computer</td>
                    <td>50-250 kWh pro Jahr</td>
                  </tr>
                  <tr>
                    <td className="py-1">LED-Lampe (8W)</td>
                    <td>~15 kWh pro Jahr bei 5 Std. täglich</td>
                  </tr>
                </tbody>
              </table>

              <h4 className="text-md font-medium mt-4">Verbrauchsspitzen</h4>
              <p>
                Der Stromverbrauch schwankt je nach Tageszeit erheblich. In Haushalten gibt es typischerweise zwei Verbrauchsspitzen:
              </p>
              <ul className="list-disc pl-6">
                <li>Morgens zwischen 6-9 Uhr, wenn Menschen aufstehen und sich für den Tag vorbereiten</li>
                <li>Abends zwischen 18-22 Uhr, wenn Menschen nach Hause kommen und kochen, fernsehen, etc.</li>
              </ul>
            </TabsContent>
            
            <TabsContent value="international" className="space-y-4">
              <h3 className="text-lg font-semibold">Internationaler Vergleich</h3>
              
              <h4 className="text-md font-medium mt-4">Durchschnittliche Haushalts-Strompreise (Cent/kWh)</h4>
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="text-left py-2">Land</th>
                    <th className="text-left py-2">Preis (inkl. Steuern)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1">Österreich</td>
                    <td>~25 Cent/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-1">Deutschland</td>
                    <td>~32 Cent/kWh (einer der höchsten in Europa)</td>
                  </tr>
                  <tr>
                    <td className="py-1">Schweiz</td>
                    <td>~20 Cent/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-1">Frankreich</td>
                    <td>~19 Cent/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-1">Italien</td>
                    <td>~23 Cent/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-1">Schweden</td>
                    <td>~17 Cent/kWh</td>
                  </tr>
                  <tr>
                    <td className="py-1">USA</td>
                    <td>~13 Cent/kWh (variiert stark nach Bundesstaat)</td>
                  </tr>
                  <tr>
                    <td className="py-1">China</td>
                    <td>~8 Cent/kWh</td>
                  </tr>
                </tbody>
              </table>
              
              <h4 className="text-md font-medium mt-4">Gründe für die Preisunterschiede</h4>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Energiemix</strong>: Länder mit hohem Anteil an Wasserkraft oder Kernkraft haben oft niedrigere Preise.
                </li>
                <li>
                  <strong>Steuern und Abgaben</strong>: In Deutschland machen Steuern und Abgaben über 50% des Strompreises aus.
                </li>
                <li>
                  <strong>Netzkosten</strong>: Bevölkerungsdichte und geografische Faktoren beeinflussen die Kosten für das Stromnetz.
                </li>
                <li>
                  <strong>Regulierung</strong>: In manchen Ländern werden Strompreise staatlich subventioniert oder reguliert.
                </li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Stromverbrauch pro Kopf</h4>
              <p>
                Der jährliche Stromverbrauch pro Kopf variiert ebenfalls stark zwischen verschiedenen Ländern:
              </p>
              <ul className="list-disc pl-6">
                <li>Norwegen: ~23.000 kWh (aufgrund von elektrischer Heizung)</li>
                <li>USA: ~12.000 kWh</li>
                <li>Schweden: ~13.000 kWh</li>
                <li>Österreich: ~7.500 kWh</li>
                <li>Deutschland: ~7.000 kWh</li>
                <li>China: ~5.000 kWh</li>
                <li>Indien: ~1.200 kWh</li>
              </ul>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default InfoModal;
