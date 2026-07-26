import React, { useMemo, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import AppHeader from '@/components/AppHeader';
import { getRegionByCode } from '@/config/regions';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Search, ExternalLink, ArrowLeft, Lightbulb, TrendingDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VersionInfo from '@/components/VersionInfo';
import ContactModal from '@/components/ContactModal';

interface FAQEntry {
  id: string;
  question: string;
  answer: React.ReactNode;
  category: 'Markt' | 'Analyzer' | 'Sparen' | 'Einspeisung';
  link?: string;
}

const FaqPage = () => {
  const { regionCode } = useParams();
  const region = getRegionByCode(regionCode);
  const [searchQuery, setSearchQuery] = useState('');

  const faqs = useMemo<FAQEntry[]>(() => [
    {
      id: 'what-is-spot',
      category: 'Markt',
      question: 'Was ist der Spotmarkt-Preis?',
      answer: (
        <p>
          Der Spotmarkt-Preis (EPEX Spot) ist der Preis, zu dem Strom für die Lieferung am nächsten Tag (Day-Ahead) 
          gehandelt wird. Er ändert sich stündlich und basiert auf Angebot (Wind, Sonne, Kraftwerke) und Nachfrage.
        </p>
      ),
    },
    {
      id: 'hyperfloater',
      category: 'Sparen',
      question: 'Was sind Hyperfloater-Tarife?',
      answer: (
        <p>
          Hyperfloater sind Stromtarife, die den Spotmarkt-Preis direkt (zzgl. einer kleinen Gebühr und Steuern) an 
          Endkunden weitergeben. Nutzer profitieren sofort von günstigen oder negativen Preisen, tragen aber auch 
          das Risiko bei hohen Preisen.
        </p>
      ),
    },
    {
      id: 'may-1st',
      category: 'Markt',
      question: 'Ist Strom am 1. Mai immer so günstig?',
      answer: (
        <div>
          <p className="mb-4">
            Feiertage wie der 1. Mai weisen oft niedrige Preise auf, da die Industrie weniger Strom verbraucht, 
            während bei schönem Wetter die Solarproduktion hoch ist.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={`/${regionCode}?f_m=4&f_dm=1&avg=daily-cycle&z=1`}>
              <TrendingDown className="mr-2 h-4 w-4" />
              Analyse: 1. Mai im Vergleich ansehen
            </Link>
          </Button>
        </div>
      ),
    },
    {
      id: 'weekend-cheaper',
      category: 'Sparen',
      question: 'Ist Strom am Wochenende wirklich günstiger?',
      answer: (
        <div>
          <p className="mb-4">
            Tendenziell ja, da die gewerbliche Nachfrage sinkt. In unserer Analyse kannst du gezielt Samstage und 
            Sonntage filtern, um den Effekt zu sehen.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to={`/${regionCode}?f_wd=0,6&avg=daily-cycle&a=1`}>
              <Search className="mr-2 h-4 w-4" />
              Wochenend-Muster analysieren
            </Link>
          </Button>
        </div>
      ),
    },
    {
      id: 'pv-producer',
      category: 'Einspeisung',
      question: 'Lohnt sich der Analyzer für PV-Besitzer (Einspeiser)?',
      answer: (
        <p>
          Absolut. Viele Einspeisetarife (z.B. OeMAG Marktpreis) orientieren sich an genau diesen Spotpreisen. 
          Wenn du weißt, in welchen Stunden der Preis hoch ist, kannst du deinen Eigenverbrauch optimieren 
          oder Speicher gezielt steuern.
        </p>
      ),
    },
    {
      id: 'grid-costs',
      category: 'Markt',
      question: 'Wie hoch sind die Netzkosten?',
      answer: (
        <p>
          Netzkosten sind regional unterschiedlich und werden von der E-Control festgelegt. Sie machen oft ca. 
          ein Drittel der Gesamtrechnung aus. Im Analyzer kannst du unter "Netzkosten" die Details für 
          deine Region einsehen.
        </p>
      ),
    },
  ], [regionCode]);

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(normalizedSearchQuery) ||
      faq.category.toLowerCase().includes(normalizedSearchQuery)
  );

  if (!region) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader title={`${region.localName} - FAQs & Wissen`} region={region} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-4">
              <Link to={`/${regionCode}`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Zurück zum Analyzer
              </Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight">Wissen & Analysen</h1>
            <p className="text-muted-foreground mt-2">
              Häufige Fragen zum Strommarkt und tiefe Einblicke in die Daten von {region.localName}.
            </p>
          </div>
        </div>

        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Frage suchen (z.B. 'Sparen', '1. Mai', 'Netzkosten')..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {filteredFaqs.length > 0 ? (
          <Accordion type="single" collapsible className="w-full space-y-4">
            {filteredFaqs.map((faq) => (
              <AccordionItem key={faq.id} value={faq.id} className="border rounded-lg bg-card px-4">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center text-left">
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground mr-3">
                      {faq.category}
                    </span>
                    <span className="font-medium">{faq.question}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4 pt-0 text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="text-center py-12">
            <Info className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-20" />
            <p className="text-muted-foreground">Keine passenden Fragen gefunden.</p>
          </div>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="bg-primary/5 border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-primary" />
                Analyzer-Tipp
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              Nutze den **Durchschnitts-Modus "Tagesverlauf"** zusammen mit einem langen Zeitraum (z.B. 1 Jahr), 
              um zu sehen, zu welcher Uhrzeit Strom in deiner Region statistisch am günstigsten ist.
            </CardContent>
          </Card>
          <Card className="bg-primary/5 border-primary/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ExternalLink className="h-5 w-5 text-primary" />
                Weiterführende Links
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <a href="https://www.e-control.at" target="_blank" rel="noopener" className="block text-primary hover:underline">
                E-Control (Regulierungsbehörde AT)
              </a>
              <a href="https://www.epexspot.com" target="_blank" rel="noopener" className="block text-primary hover:underline">
                EPEX Spot Börse
              </a>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="mt-auto border-t py-6">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} European Energy Price Analyzer</p>
          <div className="flex gap-6">
            <Link to={regionCode ? `/${regionCode}/impressum` : '/impressum'} className="hover:text-primary transition-colors">
              Impressum
            </Link>
            <Link to={regionCode ? `/${regionCode}/privacy` : '/privacy'} className="hover:text-primary transition-colors">
              Datenschutz
            </Link>
            <ContactModal />
          </div>
          <VersionInfo />
        </div>
      </footer>
    </div>
  );
};

export default FaqPage;
