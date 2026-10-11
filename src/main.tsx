
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/bungee-inline/latin-400.css';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider';

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="eepa-theme">
    <App />
  </ThemeProvider>
);
