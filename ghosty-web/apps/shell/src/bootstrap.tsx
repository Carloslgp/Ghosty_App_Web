import '@ghosty/ui/tokens.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadConfig } from './config';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App config={loadConfig()} />
  </StrictMode>,
);
