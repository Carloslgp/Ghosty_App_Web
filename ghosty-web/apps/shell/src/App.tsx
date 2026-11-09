import { Spinner } from '@ghosty/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import type { ShellConfig } from './config';
import styles from './layout/layout.module.css';
import {
  NotesHost,
  RemoteLoadersProvider,
  SafetyHost,
  defaultLoaders,
  type RemoteLoaders,
} from './notes/RemoteHosts';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { SettingsPage } from './pages/SettingsPage';
import { useSafetyUnlock } from './safety/useSafetyUnlock';

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );
  }
  if (status === 'anonymous') return <Navigate to="/entrar" replace />;
  return children;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}

/** A fachada (remote `notes`) e, depois do desbloqueio, a área de segurança no lugar dela. */
function Home() {
  const { api, user } = useAuth();
  const unlock = useSafetyUnlock();
  if (unlock.remoteUrl) {
    return (
      <SafetyHost
        remoteUrl={unlock.remoteUrl}
        api={api}
        user={{ displayName: user?.displayName ?? '' }}
        onQuickExit={unlock.quickExit}
      />
    );
  }
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <span className={styles.brand}>Notas</span>
        <Link to="/configuracoes" className={styles.settings}>
          Configurações
        </Link>
      </header>
      <NotesHost api={api} onSearchSubmit={unlock.onSearchSubmit} />
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/entrar"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/cadastro"
        element={
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        }
      />
      <Route
        path="/configuracoes"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Home />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export function App({ config, loaders = defaultLoaders }: { config: ShellConfig; loaders?: RemoteLoaders }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10_000 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider config={config}>
        <RemoteLoadersProvider loaders={loaders}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </RemoteLoadersProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
