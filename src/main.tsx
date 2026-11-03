
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/bungee-inline/latin-400.css';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider';

const IMPORT_RELOAD_KEY = 'eepa-import-reload';

const reloadAfterImportFailure = (event: Event) => {
  try {
    // A reload less than a minute ago that did not help means the deployment itself is broken;
    // reloading again would loop. Leave the error to the route error boundary instead.
    if (Date.now() - Number(sessionStorage.getItem(IMPORT_RELOAD_KEY)) < 60_000) return;
    sessionStorage.setItem(IMPORT_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
};

window.addEventListener('vite:preloadError', reloadAfterImportFailure);
window.addEventListener('eepa:importError', reloadAfterImportFailure);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="eepa-theme">
    <App />
  </ThemeProvider>
);
