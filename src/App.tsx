
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useParams } from 'react-router-dom';
import Home from './pages/Home';
import { Toaster } from '@/components/ui/toaster';
import { getRegionByCode } from '@/config/regions';
import { safeStorageGetItem } from '@/lib/safe-storage';
import { TOUR_SEEN_STORAGE_KEY } from '@/lib/onboarding';

const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const Index = lazy(() => import('./pages/Index'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ImpressumPage = lazy(() => import('./pages/ImpressumPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const OnboardingTour = lazy(() => import('@/components/OnboardingTour'));

const SITE_ORIGIN = 'https://eepa.topsrek.top';

/** Keeps <link rel="canonical"> pointing at the current route (index.html ships the home URL). */
const CanonicalLink = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.href = `${SITE_ORIGIN}${pathname}`;
  }, [pathname]);

  return null;
};

const RegionRoute = () => {
  const { regionCode } = useParams();
  const region = getRegionByCode(regionCode);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [regionCode]);

  if (!region) {
    return <NotFound />;
  }

  return (
    <>
      <Index key={region.code} region={region} />
      {/* Don't even download the tour chunk once it has been seen. */}
      {!safeStorageGetItem(TOUR_SEEN_STORAGE_KEY) && <OnboardingTour />}
    </>
  );
};

function App() {
  return (
    <Router>
      <CanonicalLink />
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/compare" element={<ComparisonPage />} />
          <Route path="/impressum" element={<ImpressumPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/:regionCode" element={<RegionRoute />} />
          <Route path="/:regionCode/faqs" element={<FaqPage />} />
          <Route path="/:regionCode/impressum" element={<ImpressumPage />} />
          <Route path="/:regionCode/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <Toaster />
    </Router>
  );
}

export default App;
