import { usePageMetadata } from '@/hooks/use-page-metadata';
import React, { useEffect } from 'react';
import AppHeader from '@/components/AppHeader';
import { getRegionByCode, defaultRegion } from '@/config/regions';
import { useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Lock, EyeOff, Server, HardDrive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const PrivacyPage = () => {
  usePageMetadata('Datenschutz - EEPA');
  const { regionCode } = useParams();
  const { pathname } = useLocation();
  const region = getRegionByCode(regionCode) || defaultRegion;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader title="Datenschutz" region={region} />
      
      <main className="container mx-auto px-4 py-12 max-w-3xl">
        <Button asChild variant="ghost" size="sm" className="mb-8">
          <Link to={regionCode ? `/${regionCode}` : '/'}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Zurück
          </Link>
        </Button>

        <div className="space-y-12">
          <section className="space-y-4">
            <h1 className="text-4xl font-extrabold tracking-tight">Datenschutz</h1>
            <p className="text-xl text-muted-foreground">
              Transparenz darüber, wie wir mit deinen Daten umgehen.
            </p>
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="h-5 w-5" />
              <h2 className="text-xl font-bold">Grundsatz</h2>
            </div>
            <p className="text-muted-foreground">
              Wir legen großen Wert auf den Schutz deiner Privatsphäre. Der European Energy Price Analyzer (EEPA) 
              ist darauf ausgelegt, so wenig personenbezogene Daten wie möglich zu erfassen.
            </p>
          </section>

          <p className="text-muted-foreground">
            Verantwortlich für die Datenverarbeitung ist der im <Link className="underline" to="/impressum">Impressum</Link> genannte Betreiber.
          </p>

          <div className="grid gap-8">
            <section className="p-6 rounded-2xl border bg-card/50 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <EyeOff className="h-5 w-5" />
                </div>
                <h3 className="font-bold">Kein Tracking</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Wir verwenden keine Tracking-Cookies, kein Google Analytics und keine anderen Dienste zur 
                Überwachung deines Nutzerverhaltens. Deine Privatsphäre bleibt gewahrt.
              </p>
            </section>

            <section className="p-6 rounded-2xl border bg-card/50 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <HardDrive className="h-5 w-5" />
                </div>
                <h3 className="font-bold">Lokale Datenverarbeitung</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Wenn du eigene <strong>Smart Meter Daten</strong> (z.B. CSV-Dateien) in den Analyzer lädst, werden diese 
                <strong>ausschließlich lokal in deinem Browser</strong> verarbeitet. Diese Daten werden niemals auf unsere 
                Server hochgeladen oder dort gespeichert.
              </p>
              <p className="text-sm text-muted-foreground">
                Im localStorage deines Browsers speichert die Website ausschließlich Einstellungen:
                eepa-theme, eepa.selectedRegion, eepa.hasSeenTour, eepa.dataResolution und eepa.priceUnit.
                Diese Einstellungen werden niemals an den Server gesendet.
              </p>
            </section>

            <section className="p-6 rounded-2xl border bg-card/50 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Server className="h-5 w-5" />
                </div>
                <h3 className="font-bold">Server-Log-Files</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Der Provider der Seiten erhebt und speichert automatisch Informationen in sogenannten 
                Server-Log-Files, die dein Browser automatisch an uns übermittelt. Dies sind: 
                Browsertyp/ Browserversion, verwendetes Betriebssystem, Referrer URL, Hostname des zugreifenden 
                Rechners, Uhrzeit der Serveranfrage, IP-Adresse. Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO.
                Unser berechtigtes Interesse ist der sichere Betrieb dieser Website.
                Aus den Log-Files erstellen wir außerdem eine tägliche Besucherstatistik (Zahl der Zugriffe,
                Land und Netz der IP-Adresse, ohne externe Dienste), um Reichweite und Missbrauch zu erkennen.
                Die Server-Log-Files und diese Statistiken werden nach 30 Tagen automatisch gelöscht.
              </p>
            </section>
          </div>

          <section className="space-y-4 pt-6 border-t">
            <h2 className="text-lg font-bold">Deine Rechte</h2>
            <p className="text-muted-foreground text-sm">
              Du hast jederzeit das Recht auf unentgeltliche Auskunft über deine gespeicherten personenbezogenen Daten, 
              deren Herkunft und Empfänger und den Zweck der Datenverarbeitung sowie ein Recht auf Berichtigung, 
              Sperrung oder Löschung dieser Daten. Hierzu sowie zu weiteren Fragen zum Thema personenbezogene Daten 
              kannst du dich jederzeit unter der im Impressum angegebenen Adresse an uns wenden.
            </p>
            <p className="text-muted-foreground text-sm">
              Du hast das Recht, dich bei der österreichischen Datenschutzbehörde zu beschweren.
            </p>
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

export default PrivacyPage;
