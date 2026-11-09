import '@ghosty/ui/tokens.css';
import { createApiClient } from '@ghosty/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';

/**
 * Modo isolado (`npm run dev:notes`): o remote roda sozinho contra o mock do BFF (Prism na 4010),
 * com um token qualquer. Dentro do shell, quem monta o cliente e a sessão é o shell.
 */
const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4010',
  getAccessToken: () => 'token-de-desenvolvimento',
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <BrowserRouter>
        <App api={api} onSearchSubmit={() => undefined} />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
