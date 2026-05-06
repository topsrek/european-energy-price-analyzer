import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, GitCompareArrows } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RegionFlag from '@/components/RegionFlag';
import {
  detectRegionFromGeoIp,
  getInitialRegion,
  getStoredRegion,
  RegionCode,
  regions,
  saveSelectedRegion,
} from '@/config/regions';

const Home = () => {
  const navigate = useNavigate();
  const initialRegion = useMemo(() => getInitialRegion(), []);
  const [suggestedRegion, setSuggestedRegion] = useState(initialRegion);
  const availableRegions = useMemo(
    () => regions.filter((region) => region.dataStatus === 'available'),
    []
  );

  useEffect(() => {
    const storedRegion = getStoredRegion();
    if (storedRegion) {
      navigate(storedRegion.path, { replace: true });
    }
  }, [navigate]);

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
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div>
            <h1 className="text-xl font-semibold">European Energy Price Analyzer</h1>
            <p className="text-sm text-muted-foreground">EEPA</p>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Choose a country</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {availableRegions.map((region) => (
                <Card key={region.code} className="rounded-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-lg">
                      <span className="flex min-w-0 items-center gap-3">
                        <RegionFlag flagCodes={region.flagCodes} className="h-5 w-7" />
                        <span className="truncate">{region.localName}</span>
                      </span>
                      <span className="text-sm font-normal text-muted-foreground">{region.appCode}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{region.description}</p>
                    <dl className="grid gap-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Market</dt>
                        <dd className="text-right">{region.market}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Timezone</dt>
                        <dd className="text-right">{region.timezone}</dd>
                      </div>
                    </dl>
                    <Button asChild className="w-full">
                      <Link to={region.path} onClick={() => handleRegionClick(region.code)}>
                        Open analyzer
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
              <Card className="rounded-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <GitCompareArrows className="h-5 w-5" />
                    Regionenvergleich
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Mehrere Stromregionen direkt im selben Chart vergleichen, mit gemeinsamer Einheit, Auflösung und Zeitraum.
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/compare">
                      Vergleich öffnen
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
          <aside className="space-y-4">
            <Card className="rounded-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4" />
                  Suggested country
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Based on your browser settings, the first available country is {suggestedRegion.localName}.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to={suggestedRegion.path} onClick={() => handleRegionClick(suggestedRegion.code)}>
                    Continue to {suggestedRegion.appCode}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Home;
