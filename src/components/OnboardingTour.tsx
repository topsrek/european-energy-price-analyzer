import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { safeStorageSetItem } from '@/lib/safe-storage';
import { TOUR_SEEN_STORAGE_KEY } from '@/lib/onboarding';

interface Step {
  title: string;
  content: string;
  target?: string; // CSS selector for highlighting (optional for now)
}

const steps: Step[] = [
  {
    title: 'Willkommen bei EEPA!',
    content: 'EEPA steht für European Energy Price Analyzer. Dieser Analyzer hilft dir, die Dynamik des europäischen Strommarktes zu verstehen. Wir visualisieren die sogenannten Spotmarkt-Preise.',
  },
  {
    title: 'Was sind Hyperfloater?',
    content: 'Die hier gezeigten Preise sind die Basis für "Hyperfloater"-Tarife. Das sind Tarife, die sich stündlich am Börsenpreis orientieren. In Österreich nutzen bereits etwa 5-10% der Haushalte solche Tarife, Tendenz steigend.',
  },
  {
    title: 'Vorteil für dich',
    content: 'Mit einem Hyperfloater-Tarif kannst du Geld sparen, indem du stromintensive Geräte (wie Waschmaschinen oder E-Autos) in Stunden mit niedrigen oder sogar negativen Preisen nutzt.',
  },
  {
    title: 'Auch für Einspeiser relevant',
    content: 'Produzierst du selbst Strom (z.B. Photovoltaik)? Viele Einspeisevergütungen orientieren sich ebenfalls an diesen Marktpreisen. Zu wissen, wann der Strom viel wert ist, hilft bei der Optimierung deiner Anlage.',
  },
  {
    title: 'Analysieren & filtern',
    content: 'Über "Durchschnitt & Filter" vergleichst du längere Zeiträume sinnvoll: Tagesverläufe zeigen typische Muster, Filter grenzen Monate, Wochentage, Stunden oder Kalenderwochen ein.',
  },
  {
    title: 'Typische Fragen',
    content: 'So beantwortest du Fragen wie: Wie teuer war Strom an Sonntagmittagen im Sommer? Oder: Welche Stunden waren im letzten Jahr im Schnitt am günstigsten?',
  },
];

const OnboardingTour: React.FC = () => {
  // Only mounted (and downloaded) when the tour has not been seen yet; see App.tsx.
  const [isOpen, setIsOpen] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    setIsOpen(false);
    safeStorageSetItem(TOUR_SEEN_STORAGE_KEY, 'true');
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleOpenChange(false);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md border-primary/20 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <Info className="h-5 w-5 text-primary" aria-hidden="true" />
            {steps[currentStep].title}
          </DialogTitle>
          <DialogDescription className="leading-relaxed pt-2">
            {steps[currentStep].content}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-1" aria-label={`Schritt ${currentStep + 1} von ${steps.length}`} role="img">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
              }`}
            />
          ))}
        </div>
        <DialogFooter className="flex-row justify-between border-t pt-4 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
          <Button size="sm" onClick={handleNext}>
            {currentStep === steps.length - 1 ? 'Starten' : 'Weiter'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingTour;
