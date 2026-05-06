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

const AppInfoModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Informationen zu EEPA">
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Über EEPA</DialogTitle>
          <DialogDescription>
            Ein privates Werkzeug von @topsrek für historische Strompreise, Verbrauchsmuster und Tarifvergleiche.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm leading-6 text-foreground">
          <p>
            EEPA macht Day-ahead-Strompreise greifbar: nach Zeitraum, Tageszeit, Wochentag und Marktphase.
            Die App deckt aktuell Österreich, Deutschland & Luxemburg sowie Frankreich ab
            und ist als europäische, länderweise erweiterbare Analyse gedacht.
          </p>
          <p>
            Ich baue sie, weil Strompreise oft abstrakt wirken. Gute Entscheidungen brauchen sichtbare Muster,
            nachvollziehbare Daten und einfache Vergleiche statt Tarif- und Marktnebel.
          </p>
          <p className="text-muted-foreground">
            Smart-Meter-Dateien bleiben im Browser. Sie werden nicht hochgeladen.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AppInfoModal;
