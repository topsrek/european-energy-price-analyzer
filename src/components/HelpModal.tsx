
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';

interface HelpModalProps {
  trigger?: React.ReactNode;
}

const HelpModal: React.FC<HelpModalProps> = ({ trigger }) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="ghost" size="sm" className="flex gap-1 items-center">
            <HelpCircle className="h-4 w-4" />
            <span>Hilfe</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Funktionen dieser Anwendung</DialogTitle>
          <DialogDescription>
            Eine kurze Erklärung der verfügbaren Funktionen und wie Sie sie nutzen können
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4">
            <section>
              <h3 className="text-lg font-semibold">Strompreise visualisieren</h3>
              <p>
                Der Hauptgraph zeigt Ihnen die Strompreise in Österreich im Zeitverlauf an. Sie können:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Den angezeigten Zeitraum über den Datumsfilter einstellen</li>
                <li>Die Anzeige auf bestimmte Monate, Wochentage oder Stunden filtern</li>
                <li>Die Daten nach verschiedenen Zeitintervallen durchschnittlich anzeigen lassen</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold">Smart Meter Daten</h3>
              <p>
                Sie können Ihre eigenen Smart Meter Daten hochladen, um Ihren persönlichen Verbrauch mit den Strompreisen zu vergleichen:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Klicken Sie auf den "Smart Meter Daten" Tab</li>
                <li>Laden Sie Ihre Daten über das Uploadfeld hoch oder klicken Sie darauf, um eine Datei auszuwählen</li>
                <li>Die Daten werden automatisch in den Graphen integriert</li>
                <li>Sie können den Verbrauch und die Kosten im Hauptgraphen ein- oder ausblenden</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold">Tarifvergleich</h3>
              <p>
                Vergleichen Sie verschiedene Stromtarife für Ihren Verbrauch:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Geben Sie Ihren jährlichen Stromverbrauch in kWh ein</li>
                <li>Die Karten und das Balkendiagramm zeigen die Jahreskosten für verschiedene Tarife</li>
                <li>Schalten Sie die Anzeige der Fixkosten ein oder aus</li>
                <li>Sehen Sie sich die detaillierte Aufschlüsselung der Fixkosten für jeden Tarif an</li>
                <li>Wählen Sie einen Tarif aus, um ihn im Hauptgraphen anzuzeigen</li>
              </ul>
            </section>

            <section>
              <h3 className="text-lg font-semibold">Hinweise</h3>
              <p>
                Wichtige Informationen zur Nutzung:
              </p>
              <ul className="list-disc pl-6 space-y-1 mt-2">
                <li>Die Netzkosten beziehen sich nur auf das Gebiet der Wiener Netze</li>
                <li>Alle Berechnungen basieren auf den angegebenen Tarifen und können von tatsächlichen Rechnungen abweichen</li>
                <li>Die dargestellten Strompreise sind reine Beispieldaten</li>
                <li>Für mehr Informationen zum österreichischen Strommarkt nutzen Sie die Info-Funktion</li>
              </ul>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default HelpModal;
