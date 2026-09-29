
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home';
import { Toaster } from '@/components/ui/toaster';
import { getRegionByCode } from '@/config/regions';

const ComparisonPage = lazy(() => import('./pages/ComparisonPage'));
const Index = lazy(() => import('./pages/Index'));
const FaqPage = lazy(() => import('./pages/FaqPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ImpressumPage = lazy(() => import('./pages/ImpressumPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const OnboardingTour = lazy(() => import('@/components/OnboardingTour'));

const RegionRoute = () => {
  const { regionCode } = useParams();
  const region = getRegionByCode(regionCode);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [regionCode]);

  if (!region) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      <Index key={region.code} region={region} />
      <OnboardingTour />
    </>
  );
};

function App() {
  return (
    <Router>
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
