import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft, Info } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { safeStorageGetItem, safeStorageSetItem } from '@/lib/safe-storage';

interface Step {
  title: string;
  content: string;
  target?: string; // CSS selector for highlighting (optional for now)
}

const steps: Step[] = [
  {
    title: 'Willkommen bei EEPA!',
    content: 'Dieser Analyzer hilft dir, die Dynamik des europäischen Strommarktes zu verstehen. Wir visualisieren die sogenannten Spotmarkt-Preise.',
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
    title: 'Alles im Blick',
    content: 'Nutze die Filter und das Lineal, um den für dich besten Tarif zu finden oder dein Verbrauchsverhalten zu analysieren. Viel Spaß beim Erkunden!',
  },
  {
    title: 'Analyse & Durchschnitt',
    content: 'Über "Durchschnitt & Filter" kannst du komplexe Fragen beantworten. Aktiviere den Durchschnitt (z.B. "Tagesverlauf"), um Muster über lange Zeiträume zu erkennen. Mit Filtern kannst du gezielt einzelne Monate, Wochentage oder sogar Kalenderwochen isolieren.',
  },
];

const OnboardingTour: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const hasSeenTour = safeStorageGetItem('eepa.hasSeenTour');
    if (!hasSeenTour) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    safeStorageSetItem('eepa.hasSeenTour', 'true');
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-md"
          >
            <Card className="shadow-2xl border-primary/20">
              <CardHeader className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2"
                  onClick={handleClose}
                >
                  <X className="h-4 w-4" />
                </Button>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-primary" />
                  {steps[currentStep].title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  {steps[currentStep].content}
                </p>
                <div className="mt-6 flex justify-center gap-1">
                  {steps.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${
                        i === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-muted'
                      }`}
                    />
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4">
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
              </CardFooter>
            </Card>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingTour;
