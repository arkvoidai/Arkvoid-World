import { StrictMode } from 'react';
import geistLatinWoff2 from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import instrumentSerifLatinWoff2 from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { installClientTelemetry } from '@/net/clientTelemetry';
import '@/index.css';


function preloadFont(href: string): void {
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
}

preloadFont(geistLatinWoff2);
preloadFont(instrumentSerifLatinWoff2);

performance.mark?.('arkvoid:react-mounted');
installClientTelemetry();

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
