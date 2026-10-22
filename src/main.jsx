import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ToastHost from './components/ToastHost';
import './styles.css';
import '@fontsource/libre-baskerville/latin-400.css';
import '@fontsource/libre-baskerville/latin-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '@fontsource/inter/latin-900.css';
import './report.css';

// Cache the production app and PDF assets after its first online visit.
// Google credentials and API responses are never cached by this worker.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then(registration => {
        // Only fires when a worker actually finishes installing — i.e. the first time ever, or right
        // after an update — never on an ordinary load where everything was already cached.
        const announceWhenReady = worker => {
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') {
              window.dispatchEvent(new CustomEvent('osito-toast', { detail: { kind: 'info', key: 'googleOfflineReady', autoDismiss: true } }));
            }
          });
        };
        announceWhenReady(registration.installing);
        registration.addEventListener('updatefound', () => announceWhenReady(registration.installing));
      })
      .catch(error => console.error('Offline app cache could not be installed.', error));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <ToastHost />
  </React.StrictMode>
);
