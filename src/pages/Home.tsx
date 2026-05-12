import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, GitCompareArrows, Globe, Sparkles } from 'lucide-react';
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
        <div className="text-center space-y-4 mb-12">
          <div className="inline-flex items-center justify-center p-2 px-4 rounded-full bg-primary/10 text-primary text-sm font-medium mb-2 animate-fade-in">
            <Sparkles className="h-4 w-4 mr-2" />
            European Energy Price Analyzer
          </div>
          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4">
            EEPA
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Verstehe den europäischen Strommarkt. Analysiere historische Spotmarkt-Preise, 
            visualisiere Trends und optimiere dein Verbrauchsverhalten.
          </p>
        </div>

        {/* Suggested Region Button - The biggest thing in the center */}
        <div className="w-full max-w-md mb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="text-center mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-[0.2em]">Empfohlene Region</span>
          </div>
          <Button 
            asChild 
            variant="default"
            className="w-full h-28 text-xl md:text-2xl shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group rounded-3xl"
          >
            <Link to={suggestedRegion.path} onClick={() => handleRegionClick(suggestedRegion.code)}>
              <div className="flex items-center justify-center w-full px-2">
                <RegionFlag flagCodes={suggestedRegion.flagCodes} className="h-10 w-14 mr-6 shadow-md rounded-sm" />
                <span className="font-bold">Weiter zu {suggestedRegion.localName}</span>
                <ArrowRight className="h-8 w-8 ml-6 group-hover:translate-x-2 transition-transform duration-300" />
              </div>
            </Link>
          </Button>
          <p className="text-center mt-6 text-sm text-muted-foreground/80">
            Wir haben {suggestedRegion.localName} basierend auf deinem Standort vorausgewählt.
          </p>
        </div>

        {/* All Regions List */}
        <div className="w-full max-w-2xl space-y-8 animate-in fade-in duration-1000 delay-300">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <h2 className="text-lg font-bold flex items-center gap-3">
              <Globe className="h-5 w-5 text-primary" />
              Andere Regionen
            </h2>
            <Link to="/compare" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-2 group">
              <GitCompareArrows className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
              Regionen vergleichen
            </Link>
          </div>
          
          <div className="grid gap-3">
            {availableRegions.map((region) => (
              <Link 
                key={region.code}
                to={region.path} 
                onClick={() => handleRegionClick(region.code)}
                className="flex items-center justify-between p-5 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-accent/40 hover:border-primary/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-5">
                  <div className="relative">
                    <RegionFlag flagCodes={region.flagCodes} className="h-7 w-10 shadow-sm rounded-sm" />
                    <div className="absolute -inset-1 bg-primary/5 rounded-lg -z-10 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div>
                    <div className="font-bold group-hover:text-primary transition-colors">{region.localName}</div>
                    <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{region.appCode}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <span className="hidden sm:block text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">{region.market}</span>
                  <div className="h-8 w-8 rounded-full bg-primary/5 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>

      <footer className="p-12 text-center text-xs text-muted-foreground/60 space-y-2 border-t border-border/40">
        <p>© {new Date().getFullYear()} European Energy Price Analyzer</p>
        <p>
          Entwickelt von <a href="https://topsrek.top" target="_blank" rel="noopener noreferrer" className="text-primary/70 hover:text-primary transition-colors font-medium">@topsrek</a> in Österreich
        </p>
      </footer>
    </div>
  );
};

export default Home;
