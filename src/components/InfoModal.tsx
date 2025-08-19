
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { HelpCircle, ExternalLink } from 'lucide-react';

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
          <Tabs defaultValue="basics">
            <TabsList className="mb-4 flex-wrap h-auto">
              <TabsTrigger value="basics">Allgemein</TabsTrigger>
              <TabsTrigger value="stakeholders">Stakeholder</TabsTrigger>
              <TabsTrigger value="prices">Preise</TabsTrigger>
              <TabsTrigger value="consumption">Verbrauch</TabsTrigger>
              <TabsTrigger value="environment">Umwelt</TabsTrigger>
              <TabsTrigger value="international">Internationaler Vergleich</TabsTrigger>
            </TabsList>
            
            <TabsContent value="basics" className="space-y-4">
              <h3 className="text-lg font-semibold">Grundlagen des Strommarkts</h3>
              <p>
                Der österreichische Strommarkt ist seit 2001 liberalisiert. Dies bedeutet, dass Sie Ihren
                Stromanbieter frei wählen können, während der Netzbetreiber durch Ihren Wohnort festgelegt ist.
              </p>
              
              <h4 className="text-md font-medium mt-4">Netzbetreiber vs. Stromanbieter</h4>
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-3">
                <div>
                  <strong>Netzbetreiber</strong>: Sind für die Strominfrastruktur und den Transport des Stroms 
                  zu Ihrem Haus zuständig. In Wien ist das "Wiener Netze". Die Netzgebühren sind reguliert und 
                  unabhängig vom gewählten Stromanbieter.
                </div>
                <div>
                  <strong>Stromanbieter</strong>: Verkaufen den Strom an Endkunden. Beispiele sind Wien Energie, 
                  Verbund, oder EVN. Sie konkurrieren um Kunden und bieten verschiedene Tarife an.
                </div>
                <div className="text-sm text-muted-foreground mt-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                  <strong>Wichtig:</strong> Manchmal haben Netzbetreiber und Stromanbieter den gleichen Namen 
                  (z.B. "EVN" ist sowohl Netzbetreiber als auch Stromanbieter), sind aber rechtlich 
                  getrennte Unternehmen. Viele dieser Unternehmen operieren mit staatlicher Beteiligung.
                </div>
              </div>
              
              <h4 className="text-md font-medium mt-4">Preisbildung am Strommarkt</h4>
              <p>
                Der Strompreis entsteht hauptsächlich durch Day-Ahead-Auktionen, bei denen der Preis für jede Stunde 
                des folgenden Tages im Voraus festgelegt wird. Anbieter und Abnehmer geben Angebote ab, und der 
                Marktpreis entsteht dort, wo sich Angebot und Nachfrage treffen.
              </p>
              
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>Aktuelle Marktdaten:</strong> Detaillierte Informationen zu aktuellen Strompreisen 
                  finden Sie auf der ENTSO-E Transparenz-Plattform.
                </p>
                <a 
                  href={`https://newtransparency.entsoe.eu/market/energyPrices?appState=%7B%22sa%22%3A%5B%22BZN%7C10YAT-APG------L%22%5D%2C%22st%22%3A%22BZN%22%2C%22mm%22%3Atrue%2C%22ma%22%3Afalse%2C%22sp%22%3A%22HALF%22%2C%22dt%22%3A%22CHART%22%2C%22df%22%3A%22${new Date().toISOString().split('T')[0]}%22%2C%22tz%22%3A%22CET%22%7D`}
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mt-1"
                >
                  ENTSO-E Transparenz-Plattform <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </TabsContent>
            
            <TabsContent value="stakeholders" className="space-y-4">
              <h3 className="text-lg font-semibold">Wichtige Akteure im Strommarkt</h3>
              
              <h4 className="text-md font-medium mt-4">Europäische Ebene</h4>
              <div className="space-y-3">
                <div className="border-l-4 border-blue-500 pl-4">
                  <strong>ENTSO-E (European Network of Transmission System Operators)</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vereinigt alle Übertragungsnetzbetreiber Europas. Koordiniert den grenzüberschreitenden 
                    Stromhandel und stellt Transparenzdaten zur Verfügung. Sorgt für die Versorgungssicherheit 
                    auf europäischer Ebene.
                  </p>
                </div>
                
                <div className="border-l-4 border-green-500 pl-4">
                  <strong>EPEX Spot</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Die europäische Strombörse, an der täglich die Strompreise für den nächsten Tag festgelegt werden. 
                    Hier finden die Day-Ahead-Auktionen statt, die die Großhandelspreise bestimmen.
                  </p>
                </div>
              </div>
              
              <h4 className="text-md font-medium mt-4">Österreichische Ebene</h4>
              <div className="space-y-3">
                <div className="border-l-4 border-red-500 pl-4">
                  <strong>APG (Austrian Power Grid)</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Der österreichische Übertragungsnetzbetreiber. Betreibt das Hochspannungsnetz (380/220 kV) 
                    und ist für die Versorgungssicherheit in ganz Österreich zuständig. Staatsunternehmen im 
                    Eigentum der Republik Österreich.
                  </p>
                </div>
                
                <div className="border-l-4 border-purple-500 pl-4">
                  <strong>Regionale Netzbetreiber</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Betreiben die regionalen Stromnetze (Mittel- und Niederspannung). Beispiele: Wiener Netze, 
                    Netz Oberösterreich, Salzburg Netz. Meist in öffentlicher Hand oder mit staatlicher Beteiligung.
                  </p>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <strong>Energieversorger</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Verkaufen Strom an Endkunden. Große Anbieter wie Verbund, Wien Energie, EVN sind oft 
                    teilweise in öffentlicher Hand. Kleinere Anbieter sind meist private Unternehmen.
                  </p>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                <h5 className="font-medium">Staatliche Beteiligung</h5>
                <p className="text-sm text-muted-foreground mt-1">
                  Viele Akteure im österreichischen Strommarkt haben eine staatliche Beteiligung:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                  <li>APG: 100% im Eigentum der Republik Österreich</li>
                  <li>Verbund: Mehrheitlich im Besitz der Republik Österreich</li>
                  <li>Wien Energie: 100% im Eigentum der Stadt Wien</li>
                  <li>Regionale Versorger: Meist im Besitz der jeweiligen Bundesländer oder Gemeinden</li>
                </ul>
              </div>
              
              <h4 className="text-md font-medium mt-4">Europäische Marktkopplung</h4>
              <div className="bg-purple-50 dark:bg-purple-950/20 p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Durch die europäische Marktkopplung sind die Strommärkte der EU-Länder miteinander verbunden. 
                  Dies führt zu einer Angleichung der Preise und erhöht die Versorgungssicherheit. Österreich 
                  profitiert von günstigem französischem Atomstrom und kann überschüssige Wasserkraft exportieren.
                </p>
              </div>
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
              
              <h4 className="text-md font-medium mt-4">Großhandelspreise vs. Endkundenpreise</h4>
              <div className="bg-orange-50 dark:bg-orange-950/20 p-4 rounded-lg space-y-3">
                <div>
                  <strong>Day-Ahead Auktionspreise 2024 (Großhandel):</strong>
                  <table className="min-w-full mt-2 text-sm">
                    <thead>
                      <tr>
                        <th className="text-left py-1">Land</th>
                        <th className="text-left py-1">€/MWh</th>
                        <th className="text-left py-1">Cent/kWh</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1">Österreich</td>
                        <td>81.54</td>
                        <td className="text-green-600 font-medium">8.15</td>
                      </tr>
                      <tr>
                        <td className="py-1">Deutschland</td>
                        <td>78.51</td>
                        <td className="text-green-600 font-medium">7.85</td>
                      </tr>
                      <tr>
                        <td className="py-1">Frankreich</td>
                        <td>58.02</td>
                        <td className="text-green-600 font-medium">5.80</td>
                      </tr>
                      <tr>
                        <td className="py-1">Norwegen</td>
                        <td>42.04</td>
                        <td className="text-green-600 font-medium">4.20</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="text-sm text-muted-foreground">
                  <strong>Wichtig:</strong> Dies sind reine Großhandelspreise ohne Netzkosten, Steuern, Abgaben und Anbietermargen!
                </div>
              </div>
              
              <h4 className="text-md font-medium mt-4">Was kommt zu den Großhandelspreisen dazu?</h4>
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li><strong>Netzkosten:</strong> ~6-9&nbsp;Cent/kWh (Transport&nbsp;und&nbsp;Verteilung) plus fixe Leistungspreise</li>
                <li><strong>Steuern und Abgaben:</strong> ~4-6 Cent/kWh (MwSt., Elektrizitätsabgabe, etc.)</li>
                <li><strong>Anbietermarge:</strong> ~2-4&nbsp;Cent/kWh (Gewinn, Vertrieb, Risiko)</li>
                <li><strong>Strompreisbremse:</strong> Staatliche Entlastung reduziert den Energiepreis bis zu einem Jahresverbrauch von 2 900 kWh.</li>
                <li><strong>Grundgebühren:</strong> Zusätzliche fixe Kosten pro Jahr</li>
              </ul>
              
              <h4 className="text-md font-medium mt-4">Endkundenpreise in Österreich</h4>
              <p className="text-sm">
                <strong>Typischer Gesamtpreis für Haushaltskunden:</strong> 20–25 Cent/kWh (inkl. Preisbremse); Neuverträge ohne Bremse liegen oft bei 25–32 Cent/kWh.
              </p>
              <div className="text-xs text-muted-foreground mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded">
                Der Großhandelspreis macht nur etwa 25-40% des Endkundenpreises aus!
              </div>
              
              <h4 className="text-md font-medium mt-4">Merit Order und Preisbildung</h4>
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2">
                <p className="text-sm">
                  <strong>Merit Order Prinzip:</strong> Kraftwerke werden nach ihren Grenzkosten der Reihe nach zugeschaltet:
                </p>
                <ol className="text-sm list-decimal list-inside space-y-1">
                  <li>Wasserkraft, Wind, Solar (sehr niedrige Grenzkosten, ~0-10 €/MWh)</li>
                  <li>Kernkraft (niedrige Grenzkosten, ~10-20 €/MWh)</li>
                  <li>Braunkohle (mittlere Grenzkosten, ~30-50 €/MWh)</li>
                  <li>Steinkohle (höhere Grenzkosten, ~60-80 €/MWh)</li>
                  <li>Gaskraftwerke (höchste Grenzkosten, ~80-150 €/MWh)</li>
                </ol>
                <p className="text-sm text-muted-foreground">
                  Der Preis wird vom teuersten Kraftwerk bestimmt, das noch benötigt wird (Grenzkraftwerk).
                </p>
              </div>
              
              <h4 className="text-md font-medium mt-4">Besondere Phänomene</h4>
              <div className="space-y-3">
                <div className="border-l-4 border-green-500 pl-4">
                  <strong>Negative Strompreise</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Wenn viel Wind- und Solarstrom produziert wird, aber wenig Nachfrage herrscht, können die Preise 
                    negativ werden. Stromerzeuger zahlen dann dafür, dass ihr Strom abgenommen wird, da das Abschalten 
                    teurer wäre.
                  </p>
                </div>
                
                <div className="border-l-4 border-orange-500 pl-4">
                  <strong>Preisvolatilität</strong>
                  <p className="text-sm text-muted-foreground mt-1">
                    Strompreise schwanken stark: von negativen Werten bis über 500 €/MWh bei Knappheit. 
                    Diese Volatilität macht langfristige Verträge für Verbraucher attraktiv.
                  </p>
                </div>
              </div>
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
              
              <h4 className="text-md font-medium mt-4">Smart Meter und dynamische Tarife</h4>
              <div className="bg-cyan-50 dark:bg-cyan-950/20 p-4 rounded-lg space-y-2">
                <p className="text-sm">
                  <strong>Smart Meter</strong> ermöglichen es, den Stromverbrauch stundengenau zu messen. 
                  Dies eröffnet neue Tarifmodelle:
                </p>
                <ul className="text-sm list-disc list-inside space-y-1">
                  <li><strong>Time-of-Use Tarife:</strong> Günstigerer Strom zu bestimmten Tageszeiten</li>
                  <li><strong>Spot-Tarife:</strong> Strompreis folgt den Börsenstrompreisen in Echtzeit</li>
                  <li><strong>Peak-Shaving:</strong> Vermeidung teurer Verbrauchsspitzen</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-2">
                  Mit Smart Metern können Verbraucher ihren Verbrauch an günstige Zeiten anpassen und Geld sparen.
                </p>
              </div>
            </TabsContent>
            
            <TabsContent value="environment" className="space-y-4">
              <h3 className="text-lg font-semibold">CO₂-Emissionen und Umweltauswirkungen</h3>
              
              <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg">
                <h4 className="text-md font-medium">Österreichs Strommix</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Österreich hat einen der saubersten Stromixe in Europa mit einem hohen Anteil an erneuerbaren Energien:
                </p>
                <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                  <li>~60% Wasserkraft</li>
                  <li>~11% Windkraft</li>
                  <li>~7% Biomasse und Biogas</li>
                  <li>~6% Photovoltaik</li>
                  <li>~16% andere Quellen (inkl. Importe)</li>
                </ul>
              </div>
              
              <h4 className="text-md font-medium mt-4">CO₂-Intensität des Stroms</h4>
              <p>
                Die CO₂-Intensität gibt an, wie viel CO₂-Äquivalent pro Kilowattstunde Strom ausgestoßen wird. 
                Österreich liegt mit rund 124&nbsp;g&nbsp;CO₂eq/kWh (vorläufiger Ø 2024) deutlich unter dem europäischen Durchschnitt.
              </p>
              
              <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>Live CO₂-Daten und Strommix:</strong> Detaillierte Informationen für alle Länder
                </p>
                <a 
                  href="https://app.electricitymaps.com/zone/AT/all/yearly"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mt-1"
                >
                  Electricity Maps - Jahresvergleich aller Länder <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
              <h4 className="text-md font-medium mt-4">Internationale CO₂-Vergleiche (2024)</h4>
              <table className="min-w-full mt-2">
                <thead>
                  <tr>
                    <th className="text-left py-2">Land</th>
                    <th className="text-left py-2">CO₂eq-Intensität (g/kWh)</th>
                    <th className="text-left py-2">Hauptquellen</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-1">Norwegen</td>
                    <td className="text-green-600 font-medium">30 g/kWh</td>
                    <td className="text-xs">Wasserkraft</td>
                  </tr>
                  <tr>
                    <td className="py-1">Frankreich</td>
                    <td className="text-green-600 font-medium">33 g/kWh</td>
                    <td className="text-xs">Kernkraft</td>
                  </tr>
                  <tr>
                    <td className="py-1">Österreich</td>
                    <td className="text-blue-600 font-medium">124 g/kWh</td>
                    <td className="text-xs">Wasserkraft, Wind</td>
                  </tr>
                  <tr>
                    <td className="py-1">Deutschland</td>
                    <td className="text-orange-600 font-medium">334 g/kWh</td>
                    <td className="text-xs">Gas, Kohle, Wind</td>
                  </tr>
                  <tr>
                    <td className="py-1">China</td>
                    <td className="text-red-600 font-medium">513 g/kWh</td>
                    <td className="text-xs">Kohle</td>
                  </tr>
                  <tr>
                    <td className="py-1">Polen</td>
                    <td className="text-red-600 font-medium">703 g/kWh</td>
                    <td className="text-xs">Kohle</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-2">
                Quelle: <a href="https://app.electricitymaps.com/zone/AT/all/yearly" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">Electricity Maps 2024</a>
              </p>
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <h5 className="font-medium">Warum schwankt die CO₂-Intensität?</h5>
                <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside">
                  <li>Tageszeit: Nachts weniger Solarstrom, mehr Wasserkraft</li>
                  <li>Wetter: Wenig Wind = mehr Gas-/Kohlestrom</li>
                  <li>Importe: Bei hoher Nachfrage Importe aus Deutschland/Italien</li>
                  <li>Saison: Winter = mehr Heizung = mehr fossile Brennstoffe</li>
                </ul>
              </div>
            </TabsContent>
            
            <TabsContent value="international" className="space-y-4">
              <h3 className="text-lg font-semibold">Internationaler Vergleich</h3>
              
              <div className="mb-4 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-sm">
                  <strong>Aktuelle internationale Strompreise:</strong> Detaillierte Preisvergleiche finden Sie hier
                </p>
                <a 
                  href="https://www.energy-charts.info/charts/price_average/chart.htm?l=de&c=ALL&interval=year"
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm mt-1"
                >
                  Energy Charts - Internationale Preisvergleiche <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              
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
