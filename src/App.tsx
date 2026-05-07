
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home';
import ComparisonPage from './pages/ComparisonPage';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import { Toaster } from '@/components/ui/toaster';
import { getRegionByCode } from '@/config/regions';
import OnboardingTour from '@/components/OnboardingTour';

const RegionRoute = () => {
  const { regionCode } = useParams();
  const region = getRegionByCode(regionCode);

  if (!region) {
    return <Navigate to="/" replace />;
  }

  return <Index region={region} />;
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/compare" element={<ComparisonPage />} />
        <Route path="/:regionCode" element={<RegionRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
      <OnboardingTour />
    </Router>
  );
}

export default App;
