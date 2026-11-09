import '@ghosty/ui/tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadConfig } from './config';
import { registerServiceWorker } from './pwa/register';

registerServiceWorker(import.meta.env.VITE_NOTES_REMOTE_URL || 'http://localhost:5174/remoteEntry.js');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App config={loadConfig()} />
  </StrictMode>,
);
