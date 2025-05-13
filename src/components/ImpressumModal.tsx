
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const ImpressumModal = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="link" className="text-gray-500 text-sm p-0 h-auto">Impressum</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Impressum</DialogTitle>
          <DialogDescription>
            Rechtliche Informationen zum Wiener Strompreis-Rechner
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold">Anbieter</h3>
            <p>Wiener Strompreis-Rechner</p>
            <p>Musterstraße 123</p>
            <p>1010 Wien, Österreich</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Kontakt</h3>
            <p>E-Mail: info@strompreis-rechner.at</p>
            <p>Telefon: +43 1 234567</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Rechtliches</h3>
            <p>Der Wiener Strompreis-Rechner ist ein informatives Tool zur Berechnung von Stromtarifen.</p>
            <p>Alle Berechnungen erfolgen ohne Gewähr. Die Daten und Berechnungen dienen lediglich der Orientierung.</p>
          </div>
          
          <div>
            <h3 className="font-semibold">Datenverwendung</h3>
            <p>Hochgeladene Smart Meter Daten werden nur zur Berechnung verwendet und nicht gespeichert.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImpressumModal;
