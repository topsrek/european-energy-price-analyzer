import { Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const ComparisonInfoModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex h-fit items-center gap-1 md:h-9">
          <Info className="h-4 w-4" />
          <span className="whitespace-normal">Wie lese ich den Regionenvergleich?</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Regionenvergleich</DialogTitle>
          <DialogDescription>
            Mehrere Day-ahead-Preisregionen in derselben Ansicht gegenüberstellen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-6 text-foreground">
          <p>
            Die Vergleichsansicht legt mehrere Preisregionen auf denselben Zeitraum, dieselbe Einheit und dieselbe
            Auflösung. So sehen Sie direkt, welche Region in einer Marktphase höher oder niedriger lag.
          </p>
          <p>
            Für einen fairen Vergleich sollten Sie dieselbe Auflösung und einen gemeinsamen Zeitraum wählen. Mit
            Durchschnitt und Filtern können Sie danach gezielt Tages-, Wochen- oder Zeitfenster vergleichen.
          </p>
          <p className="text-muted-foreground">
            Das Preis-Lineal zeigt die Verteilung relativ zu einem Schwellenwert. Bei mehreren Regionen wird die
            Statistik je Region getrennt ausgewiesen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ComparisonInfoModal;
