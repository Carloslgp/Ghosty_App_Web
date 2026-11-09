import '@ghosty/ui/tokens.css';
import { createApiClient } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/** Modo isolado (`npm run dev:safety`): roda contra o mock do BFF (Prism na 4010), com tokens quaisquer. */
const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4010',
  getAccessToken: () => 'token-de-desenvolvimento',
  getSafetyToken: () => 'sessao-de-desenvolvimento',
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <App api={api} user={{ displayName: 'Maria' }} onQuickExit={() => window.location.reload()} />
    </QueryClientProvider>
  </StrictMode>,
);
