import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BarChartHorizontal, Globe, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RegionFlag from '@/components/RegionFlag';
import {
  detectRegionFromGeoIp,
  guessRegionFromBrowser,
  RegionCode,
  regions,
  saveSelectedRegion,
} from '@/config/regions';

const Home = () => {
  const initialRegion = useMemo(() => guessRegionFromBrowser(), []);
  const [suggestedRegion, setSuggestedRegion] = useState(initialRegion);
  const availableRegions = useMemo(
    () => regions.filter((region) => region.dataStatus === 'available'),
    []
  );

  useEffect(() => {
    let cancelled = false;

    detectRegionFromGeoIp().then((region) => {
      if (!cancelled && region) {
        setSuggestedRegion(region);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRegionClick = (code: RegionCode) => {
    saveSelectedRegion(code);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 max-w-4xl mx-auto w-full">
        {/* Intro Section */}
        <div className="text-center space-y-6 mb-16">
          <div className="space-y-2">
            <h1 className="home-title-logo text-6xl md:text-8xl">
              EEPA
            </h1>
            <p className="text-sm md:text-base text-muted-foreground font-medium tracking-normal">
              European Energy Price Analyzer
            </p>
          </div>

          <p className="text-sm md:text-base text-muted-foreground/80 max-w-xl mx-auto pt-4 leading-relaxed">
            Mit EEPA findest du Antworten auf komplexe Fragen zum Strommarkt.
            Analysiere historische Daten, erkenne Preismuster und optimiere deine Energienutzung.
          </p>

          <div className="comic-speech-bubble relative inline-block mt-4">
            <div className="comic-speech-bubble__body relative z-10 p-6 md:px-10">
              <div className="flex items-start gap-3">
                <MessageSquare className="h-5 w-5 text-primary mt-1 shrink-0" />
                <p className="text-lg md:text-xl font-semibold leading-snug">
                  "Wie teuer ist der stündliche Strompreis im Sommer zu Mittag?"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Region Selection List */}
        <div className="w-full max-w-2xl space-y-4">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4 mb-6">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Region auswählen</h2>
          </div>
          
          <div className="grid gap-4">
            {/* Suggested Region - Integrated but Highlighted */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] ml-2">Empfohlen basierend auf Standort</span>
              <Link 
                to={suggestedRegion.path} 
                onClick={() => handleRegionClick(suggestedRegion.code)}
                aria-label={`Empfohlene Region öffnen: ${suggestedRegion.localName}`}
                className="flex items-center justify-between p-6 rounded-3xl border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 transition-all duration-200 group shadow-md"
              >
                <div className="flex items-center gap-5">
                  <RegionFlag flagCodes={suggestedRegion.flagCodes} className="h-8 w-12 shadow-md rounded-sm" />
                  <div>
                    <div className="text-xl font-black group-hover:text-primary transition-colors">{suggestedRegion.localName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{suggestedRegion.appCode}</div>
                  </div>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground transition-all duration-200 group-hover:scale-110">
                  <ArrowRight className="h-5 w-5" />
                </div>
              </Link>
            </div>

            {/* Other Regions */}
            <div className="grid gap-2 pt-4">
              {availableRegions.filter(r => r.code !== suggestedRegion.code).map((region) => (
                <Link 
                  key={region.code}
                  to={region.path} 
                  onClick={() => handleRegionClick(region.code)}
                  className="flex items-center justify-between p-4 rounded-2xl border border-border/40 bg-card/30 hover:bg-accent/40 hover:border-primary/20 transition-all duration-200 group"
                >
                  <div className="flex items-center gap-4">
                    <RegionFlag flagCodes={region.flagCodes} className="h-6 w-9 shadow-sm rounded-sm" />
                    <div>
                      <div className="font-bold group-hover:text-primary transition-colors">{region.localName}</div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{region.appCode}</div>
                    </div>
                  </div>
                  <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Separator and Comparison Entry */}
            <div className="pt-6 mt-4 border-t border-border/40">
              <Link 
                to="/compare"
                className="flex items-center justify-between p-5 rounded-2xl border border-dashed border-primary/30 bg-secondary/20 hover:bg-secondary/40 transition-all duration-200 group"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 flex items-center justify-center bg-primary/10 rounded-xl">
                    <BarChartHorizontal className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-foreground">Regionen vergleichen</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">Cross-Market Analysis</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-8 w-8 rounded-full border border-primary/20 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </main>

      <footer className="p-12 text-center text-xs text-muted-foreground/60 space-y-4 border-t border-border/40 bg-muted/20">
        <p>© {new Date().getFullYear()} European Energy Price Analyzer</p>
        <p>
          Entwickelt von <a href="https://topsrek.top" target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary transition-colors font-medium">@topsrek</a> in Österreich
        </p>
        <div className="flex justify-center gap-6 pt-2">
          <Link to="/impressum" className="hover:text-primary transition-colors font-medium">Impressum</Link>
          <Link to="/privacy" className="hover:text-primary transition-colors font-medium">Datenschutz</Link>
        </div>
      </footer>
    </div>
  );
};

export default Home;
