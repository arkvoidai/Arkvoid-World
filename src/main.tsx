import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/index.css';

performance.mark?.('arkvoid:react-mounted');

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registerWorker = () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // The application remains usable without the optional offline cache.
    });
  };
  if (document.readyState === 'complete') registerWorker();
  else window.addEventListener('load', registerWorker, { once: true });
}
