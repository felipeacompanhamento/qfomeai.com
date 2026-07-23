import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';

// Register service worker for SPA routing and PWA features
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Unregister all existing service workers to avoid conflicts
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).then(() => {
      navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
        .then(registration => {
          console.log('Service Worker registered for SPA routing:', registration.scope);
        })
        .catch(err => {
          console.error('Service Worker registration failed:', err);
        });
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
