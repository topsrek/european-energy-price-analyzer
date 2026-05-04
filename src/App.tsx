
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import Home from './pages/Home';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import { Toaster } from '@/components/ui/toaster';
import { getRegionByCode } from '@/config/regions';

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
        <Route path="/:regionCode" element={<RegionRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default App;
