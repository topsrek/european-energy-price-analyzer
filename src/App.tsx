
import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home';
import ComparisonPage from './pages/ComparisonPage';
import Index from './pages/Index';
import FaqPage from './pages/FaqPage';
import NotFound from './pages/NotFound';
import ImpressumPage from './pages/ImpressumPage';
import PrivacyPage from './pages/PrivacyPage';
import { Toaster } from '@/components/ui/toaster';
import { getRegionByCode } from '@/config/regions';
import OnboardingTour from '@/components/OnboardingTour';

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
      <Index region={region} />
      <OnboardingTour />
    </>
  );
};

function App() {
  return (
    <Router>
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
      <Toaster />
    </Router>
  );
}

export default App;
