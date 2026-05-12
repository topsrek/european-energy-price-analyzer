import React from 'react';
import AppHeader from '@/components/AppHeader';
import { getRegionByCode, defaultRegion } from '@/config/regions';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Mail, MapPin, ShieldCheck, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const ImpressumPage = () => {
  const { regionCode } = useParams();
  const region = getRegionByCode(regionCode) || defaultRegion;

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader title="Impressum" region={region} />
      
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-8">
          <Link to={regionCode ? `/${regionCode}` : '/'}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>

        <div className="space-y-12">
          <section className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight">Impressum</h1>
            <p className="text-xl text-muted-foreground">
              Gesetzliche Informationen zum European Energy Price Analyzer (EEPA).
            </p>
          </section>

          <div className="grid gap-12 md:grid-cols-2">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Globe className="h-5 w-5" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Anbieter</h2>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <p className="font-semibold text-foreground">@topsrek</p>
                <p>Peter W.</p>
                <div className="flex items-start gap-2 pt-2">
                  <MapPin className="h-4 w-4 mt-1 shrink-0" />
                  <p>Wien, Österreich</p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-primary">
                <Mail className="h-5 w-5" />
                <h2 className="text-lg font-bold uppercase tracking-wider">Kontakt</h2>
              </div>
              <div className="space-y-1 text-muted-foreground">
                <p>E-Mail: topsrek@gmail.com</p>
                <p>Web: <a href="https://topsrek.top" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">topsrek.top</a></p>
                <p>GitHub: <a href="https://github.com/topsrek" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">@topsrek</a></p>
              </div>
            </section>
          </div>

          <section className="space-y-4 pt-6 border-t">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <h2 className="text-lg font-bold uppercase tracking-wider">Rechtliche Hinweise</h2>
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground space-y-4">
              <p>
                Der **European Energy Price Analyzer (EEPA)** ist ein privates Projekt zur Visualisierung und Analyse 
                öffentlich zugänglicher Strommarkt-Daten. Alle Berechnungen erfolgen ohne Gewähr.
              </p>
              <p>
                Die Inhalte dieser Anwendung wurden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit 
                und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen. Als Diensteanbieter sind wir gemäß 
                allgemeinen Gesetzen für eigene Inhalte auf diesen Seiten verantwortlich, jedoch nicht verpflichtet, 
                übermittelte oder gespeicherte fremde Informationen zu überwachen.
              </p>
              <p>
                EEPA ist eine Arbeitsbezeichnung. Eine markenrechtliche Klärung steht noch aus, bevor das Branding 
                als final betrachtet werden kann.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="mt-auto border-t py-12 bg-muted/30">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} European Energy Price Analyzer | Wien, Österreich</p>
        </div>
      </footer>
    </div>
  );
};

export default ImpressumPage;
