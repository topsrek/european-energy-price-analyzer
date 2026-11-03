
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/bungee-inline/latin-400.css';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider';

const reloadAfterImportFailure = (event: Event) => {
  event.preventDefault();
  try {
    // Keep this across reloads: a broken deployment must not trap the tab in a loop.
    if (sessionStorage.getItem('eepa-import-reload')) return;
    sessionStorage.setItem('eepa-import-reload', '1');
  } catch {
    // Without persistent storage we cannot safely guard an automatic reload.
    return;
  }
  window.location.reload();
};

window.addEventListener('vite:preloadError', reloadAfterImportFailure);
window.addEventListener('eepa:importError', reloadAfterImportFailure);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider defaultTheme="light" storageKey="eepa-theme">
    <App />
  </ThemeProvider>
);
