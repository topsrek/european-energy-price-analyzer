import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GitCompareArrows, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import RegionFlag from '@/components/RegionFlag';
import {
  detectRegionFromGeoIp,
  getInitialRegion,
  RegionCode,
  regions,
  saveSelectedRegion,
} from '@/config/regions';

const Home = () => {
  const initialRegion = useMemo(() => getInitialRegion(), []);
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
        <div className="text-center space-y-4 mb-16">
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            EEPA — European Energy Price Analyzer
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed italic">
            "Wie teuer ist der stündliche Strompreis im Sommer zu Mittag?"
          </p>
          <p className="text-sm text-muted-foreground/80 max-w-xl mx-auto">
            Analysiere historische Spotmarkt-Preise, visualisiere Trends und optimiere dein Verbrauchsverhalten.
          </p>
        </div>

        {/* Suggested Region Button */}
        <div className="w-full max-w-md mb-24">
          <div className="text-center mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em]">Empfohlene Region</span>
          </div>
          <Button 
            asChild 
            variant="default"
            className="w-full h-28 text-xl md:text-2xl shadow-xl hover:shadow-2xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 group rounded-3xl"
          >
            <Link to={suggestedRegion.path} onClick={() => handleRegionClick(suggestedRegion.code)}>
              <div className="flex items-center justify-center w-full px-2">
                <RegionFlag flagCodes={suggestedRegion.flagCodes} className="h-10 w-14 mr-6 shadow-md rounded-sm" />
                <span className="font-bold">Weiter zu {suggestedRegion.localName}</span>
                <ArrowRight className="h-8 w-8 ml-6 group-hover:translate-x-1 transition-transform duration-200" />
              </div>
            </Link>
          </Button>
          <p className="text-center mt-6 text-xs text-muted-foreground/60">
            Wir haben {suggestedRegion.localName} basierend auf deinem Standort vorausgewählt.
          </p>
        </div>

        {/* All Regions List */}
        <div className="w-full max-w-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-border/60 pb-4">
            <Globe className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Alle Regionen</h2>
          </div>
          
          <div className="grid gap-3">
            {availableRegions.map((region) => (
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
                <div className="flex items-center gap-4">
                  <span className="hidden sm:block text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">{region.market}</span>
                  <div className="h-7 w-7 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </Link>
            ))}

            {/* Separator and Comparison Entry */}
            <div className="pt-4 mt-2 border-t border-border/40">
              <Link 
                to="/compare"
                className="flex items-center justify-between p-4 rounded-2xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all duration-200 group"
              >
                <div className="flex items-center gap-4">
                  <div className="h-6 w-9 flex items-center justify-center bg-primary/10 rounded-sm">
                    <GitCompareArrows className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold text-primary">Regionen vergleichen</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">MULTI-ZONE COMPARISON</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="hidden sm:block text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Historical Spot Analysis</span>
                  <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground transition-all duration-200 group-hover:scale-110">
                    <ArrowRight className="h-3.5 w-3.5" />
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
          <Link to="/impressum" className="hover:text-primary transition-colors">Impressum</Link>
          <Link to="/privacy" className="hover:text-primary transition-colors">Datenschutz</Link>
        </div>
      </footer>
    </div>
  );
};

export default Home;
