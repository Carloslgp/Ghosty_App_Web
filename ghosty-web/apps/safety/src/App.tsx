import type { SafetyAppProps } from '@ghosty/api-client';
import { MemoryRouter, NavLink, Navigate, Route, Routes } from 'react-router';
import { ApiContext } from './features/api';
import { CheckInScreen } from './features/check-in';
import { OfficialChannels, QuickExitButton } from './features/components';
import { DISCLAIMER, HelpRequestScreen } from './features/help';
import { ChannelsScreen } from './features/info';
import { SafeTestScreen } from './features/safe-test';
import {
  DashboardScreen,
  MessageScreen,
  NetworkScreen,
  OnboardingScreen,
  SecuritySettingsScreen,
} from './features/screens';
import styles from './features/safety.module.css';

const SECTIONS = [
  { to: '/painel', label: 'Painel' },
  { to: '/rede', label: 'Rede de apoio' },
  { to: '/mensagem', label: 'Mensagem' },
  { to: '/check-in', label: 'Check-in' },
  { to: '/teste', label: 'Teste seguro' },
  { to: '/canais', label: 'Canais oficiais' },
  { to: '/ajustes', label: 'Ajustes' },
];

/**
 * O remote `safety`, exposto como `safety/App`. Usa `MemoryRouter`: a URL do navegador não muda e nada
 * desta área entra no histórico. A saída rápida fica sempre visível (e também com Esc duas vezes).
 */
export default function SafetyApp({ api, user, onQuickExit }: SafetyAppProps) {
  return (
    <ApiContext value={api}>
      <MemoryRouter initialEntries={['/painel']}>
        <div className={styles.app}>
          <header className={styles.header}>
            <span>Olá, {user.displayName}</span>
            <QuickExitButton onQuickExit={onQuickExit} />
          </header>
          <nav aria-label="Seções" className={styles.nav}>
            {SECTIONS.map((section) => (
              <NavLink key={section.to} to={section.to} className={styles.navLink}>
                {section.label}
              </NavLink>
            ))}
          </nav>
          <main className={styles.main}>
            <Routes>
              <Route path="/onboarding" element={<OnboardingScreen />} />
              <Route path="/painel" element={<DashboardScreen />} />
              <Route path="/rede" element={<NetworkScreen />} />
              <Route path="/mensagem" element={<MessageScreen />} />
              <Route path="/ajuda/:helpRequestId" element={<HelpRequestScreen />} />
              <Route path="/check-in" element={<CheckInScreen />} />
              <Route path="/teste" element={<SafeTestScreen />} />
              <Route path="/canais" element={<ChannelsScreen />} />
              <Route path="/ajustes" element={<SecuritySettingsScreen />} />
              <Route path="*" element={<Navigate to="/painel" replace />} />
            </Routes>
          </main>
          <footer className={styles.footer}>
            <p className={styles.hint}>{DISCLAIMER}</p>
            <OfficialChannels />
          </footer>
        </div>
      </MemoryRouter>
    </ApiContext>
  );
}
