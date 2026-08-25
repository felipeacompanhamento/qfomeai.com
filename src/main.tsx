import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';

// Suppress WebSocket HMR connection errors in sandboxed preview environments
window.addEventListener('unhandledrejection', (event) => {
  const reasonStr = event.reason ? String(event.reason.message || event.reason) : '';
  if (reasonStr.includes('WebSocket') || reasonStr.includes('closed without opened') || reasonStr.includes('HMR')) {
    event.preventDefault();
  }
});

// Service Worker control according to environment
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      // Em ambiente DEV / AI Studio: Desativar Service Worker e apagar caches do qfomeai
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });

      if ('caches' in window) {
        caches.keys().then((cacheNames) => {
          for (const cacheName of cacheNames) {
            if (cacheName.startsWith('qfomeai')) {
              caches.delete(cacheName);
            }
          }
        });
      }
    } else if (import.meta.env.PROD) {
      // Registrar Service Worker SOMENTE em produção
      navigator.serviceWorker
        .register('/firebase-messaging-sw.js', { scope: '/' })
        .then((registration) => {
          console.log('Service Worker registered for SPA routing:', registration.scope);
        })
        .catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
